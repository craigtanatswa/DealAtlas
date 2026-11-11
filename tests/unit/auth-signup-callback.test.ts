import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookiesMock = vi.hoisted(() => {
  type CookieSet = {
    name: string;
    value: string;
    options?: Record<string, unknown>;
  };
  const values = new Map<string, string>();
  const sets: CookieSet[] = [];
  const deletes: Array<string | { name: string; path?: string }> = [];

  return {
    values,
    sets,
    deletes,
    reset() {
      values.clear();
      sets.length = 0;
      deletes.length = 0;
    },
    store: {
      get(name: string) {
        const value = values.get(name);
        return value === undefined ? undefined : { name, value };
      },
      getAll() {
        return Array.from(values, ([name, value]) => ({ name, value }));
      },
      has(name: string) {
        return values.has(name);
      },
      set(
        nameOrOptions:
          | string
          | { name: string; value: string; [key: string]: unknown },
        value?: string,
        options?: Record<string, unknown>,
      ) {
        const name =
          typeof nameOrOptions === "string" ? nameOrOptions : nameOrOptions.name;
        const cookieValue =
          typeof nameOrOptions === "string"
            ? (value ?? "")
            : nameOrOptions.value;
        const cookieOptions =
          typeof nameOrOptions === "string" ? options : nameOrOptions;
        values.set(name, cookieValue);
        sets.push({ name, value: cookieValue, options: cookieOptions });
      },
      delete(nameOrOptions: string | { name: string; path?: string }) {
        const name =
          typeof nameOrOptions === "string" ? nameOrOptions : nameOrOptions.name;
        deletes.push(nameOrOptions);
        values.delete(name);
        return this;
      },
    },
  };
});

const authMock = vi.hoisted(() => ({
  signUp: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => cookiesMock.store,
  headers: async () => new Headers(),
}));

vi.mock("@/lib/env/public", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_APP_URL: "https://www.dealatlas.uk",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: authMock }),
}));

vi.mock("@/lib/analytics/server", () => ({
  captureServerEvent: vi.fn(async () => undefined),
}));

import { GET } from "@/app/auth/callback/route";
import {
  OAUTH_NEXT_COOKIE,
  SIGNUP_NEXT_COOKIE,
} from "@/lib/auth/cookies";
import {
  AUTH_HOME_PATH,
  NEXT_INVALID_FALLBACK_PATH,
  RESET_PASSWORD_PATH,
  checkoutPathForPlan,
} from "@/lib/auth/redirect";
import { CHECKOUT_PLAN_KEYS } from "@/lib/billing/types";

const HOSTILE_NEXT_VALUES = [
  "//evil.com",
  "/\\evil.com",
  "https://evil.com",
  "%2F%2Fevil.com",
  "%252F%252Fevil.com",
  "/%5Cevil.com",
  "javascript:alert(1)",
  "/checkout\r\nSet-Cookie: x=1",
  "/checkout%0d%0aSet-Cookie:%20x=1",
  " //evil.com",
  `/checkout?plan=lifetime&utm_source=${"a".repeat(300)}`,
  "/login?next=//evil.com",
  "/auth/callback?next=%2F%2Fevil.com",
] as const;

function user(metadata: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    user_metadata: metadata,
    app_metadata: { provider: "email" },
    created_at: "2026-01-01T00:00:00.000Z",
    last_sign_in_at: "2026-01-01T00:00:00.000Z",
  };
}

function verifySuccess(metadata: Record<string, unknown> = {}) {
  authMock.verifyOtp.mockResolvedValue({
    data: { user: user(metadata), session: { access_token: "token" } },
    error: null,
  });
}

function confirmRequest(params: Record<string, string>) {
  const url = new URL("https://www.dealatlas.uk/auth/confirm");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

function expectRedirect(
  response: Response,
  request: NextRequest,
  expectedPath: string,
) {
  const location = response.headers.get("location");
  expect(location).not.toBeNull();
  const url = new URL(location as string, request.url);
  expect(url.origin).toBe(new URL(request.url).origin);
  expect(`${url.pathname}${url.search}`).toBe(expectedPath);
}

function expectSignupCookieDeleted() {
  expect(cookiesMock.deletes).toEqual(
    expect.arrayContaining([{ name: SIGNUP_NEXT_COOKIE, path: "/auth" }]),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cookiesMock.reset();
  authMock.verifyOtp.mockReset();
  authMock.exchangeCodeForSession.mockReset();
  authMock.updateUser.mockReset();
  verifySuccess();
  authMock.exchangeCodeForSession.mockResolvedValue({
    data: { user: user(), session: { access_token: "token" } },
    error: null,
  });
  authMock.updateUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe("auth callback signup next", () => {
  it("keeps every checkout plan from the email link query", async () => {
    for (const plan of CHECKOUT_PLAN_KEYS) {
      const next = checkoutPathForPlan(plan);
      const request = confirmRequest({
        token_hash: "token-hash",
        type: "email",
        next,
      });
      const response = await GET(request);
      expectRedirect(response, request, next);
    }
  });

  it("keeps every checkout plan from user metadata with no cookie", async () => {
    for (const plan of CHECKOUT_PLAN_KEYS) {
      const next = checkoutPathForPlan(plan);
      verifySuccess({ next });
      const request = confirmRequest({
        token_hash: "token-hash",
        type: "email",
      });
      const response = await GET(request);
      expectRedirect(response, request, next);
    }
  });

  it("preserves valid UTM query params", async () => {
    const next =
      "/checkout?plan=lifetime&utm_source=newsletter&utm_medium=email";
    const request = confirmRequest({
      token_hash: "token-hash",
      type: "email",
      next,
    });
    const response = await GET(request);
    expectRedirect(response, request, next);
  });

  it("keeps the same-device cookie destination", async () => {
    const next = "/checkout?plan=lifetime&utm_source=cookie";
    cookiesMock.values.set(SIGNUP_NEXT_COOKIE, next);
    const request = confirmRequest({
      token_hash: "token-hash",
      type: "email",
    });
    const response = await GET(request);
    expectRedirect(response, request, next);
    expectSignupCookieDeleted();
  });

  it("prefers query over cookie over metadata", async () => {
    const queryNext = `${checkoutPathForPlan("PRO_MONTHLY")}&utm_source=query`;
    cookiesMock.values.set(
      SIGNUP_NEXT_COOKIE,
      checkoutPathForPlan("PRO_ANNUAL"),
    );
    verifySuccess({ next: checkoutPathForPlan("founding_lifetime") });

    const queryRequest = confirmRequest({
      token_hash: "token-hash",
      type: "email",
      next: queryNext,
    });
    expectRedirect(await GET(queryRequest), queryRequest, queryNext);
  });

  it("prefers cookie over metadata when the query is absent", async () => {
    const cookieNext = `${checkoutPathForPlan("PRO_ANNUAL")}&utm_source=cookie`;
    cookiesMock.values.set(SIGNUP_NEXT_COOKIE, cookieNext);
    verifySuccess({ next: checkoutPathForPlan("founding_lifetime") });

    const request = confirmRequest({
      token_hash: "token-hash",
      type: "email",
    });
    expectRedirect(await GET(request), request, cookieNext);
  });

  it("uses metadata when the query and cookie are absent or invalid", async () => {
    const metadataNext = `${checkoutPathForPlan("founding_lifetime")}&utm_source=metadata`;
    cookiesMock.values.set(SIGNUP_NEXT_COOKIE, "https://evil.com");
    verifySuccess({ next: metadataNext });

    const request = confirmRequest({
      token_hash: "token-hash",
      type: "email",
    });
    expectRedirect(await GET(request), request, metadataNext);
  });

  it("ignores hostile query values and lands on the invalid fallback", async () => {
    for (const hostile of HOSTILE_NEXT_VALUES) {
      cookiesMock.reset();
      verifySuccess();
      const request = confirmRequest({
        token_hash: "token-hash",
        type: "email",
        next: hostile,
      });
      const response = await GET(request);
      expectRedirect(response, request, NEXT_INVALID_FALLBACK_PATH);
    }
  });

  it("ignores hostile cookie values and lands on the default path", async () => {
    for (const hostile of HOSTILE_NEXT_VALUES) {
      cookiesMock.reset();
      verifySuccess();
      cookiesMock.values.set(SIGNUP_NEXT_COOKIE, hostile);
      const request = confirmRequest({
        token_hash: "token-hash",
        type: "email",
      });
      const response = await GET(request);
      expectRedirect(response, request, AUTH_HOME_PATH);
    }
  });

  it("ignores hostile metadata values and lands on the default path", async () => {
    for (const hostile of HOSTILE_NEXT_VALUES) {
      cookiesMock.reset();
      verifySuccess({ next: hostile });
      const request = confirmRequest({
        token_hash: "token-hash",
        type: "email",
      });
      const response = await GET(request);
      expectRedirect(response, request, AUTH_HOME_PATH);
    }
  });

  it("lands on the default path when cookie and metadata are missing", async () => {
    const request = confirmRequest({
      token_hash: "token-hash",
      type: "email",
    });
    const response = await GET(request);
    expectRedirect(response, request, AUTH_HOME_PATH);
  });

  it("clears the signup cookie on invalid link errors", async () => {
    cookiesMock.values.set(
      SIGNUP_NEXT_COOKIE,
      checkoutPathForPlan("founding_lifetime"),
    );
    const request = confirmRequest({ type: "signup" });
    const response = await GET(request);
    expectRedirect(response, request, "/login?error=invalid_link");
    expectSignupCookieDeleted();
  });

  it("clears the signup cookie on verification failures", async () => {
    cookiesMock.values.set(
      SIGNUP_NEXT_COOKIE,
      checkoutPathForPlan("founding_lifetime"),
    );
    authMock.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "invalid token" },
    });
    const request = confirmRequest({
      token_hash: "token-hash",
      type: "email",
    });
    const response = await GET(request);
    expectRedirect(response, request, "/login?error=verification_failed");
    expectSignupCookieDeleted();
  });

  it("clears metadata next with the user's session after use", async () => {
    const next = checkoutPathForPlan("founding_lifetime");
    verifySuccess({ next });
    const request = confirmRequest({
      token_hash: "token-hash",
      type: "email",
    });

    const response = await GET(request);

    expectRedirect(response, request, next);
    expect(authMock.updateUser).toHaveBeenCalledWith({ data: { next: null } });
  });

  it("still redirects when clearing metadata next fails", async () => {
    const next = checkoutPathForPlan("PRO_MONTHLY");
    verifySuccess({ next });
    authMock.updateUser.mockRejectedValueOnce(new Error("auth store down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = confirmRequest({
      token_hash: "token-hash",
      type: "email",
    });

    const response = await GET(request);

    expectRedirect(response, request, next);
    expect(errorSpy).toHaveBeenCalledWith(
      "DealAtlas signup next cleanup failed",
      "Error",
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(next);
    errorSpy.mockRestore();
  });

  it("never lets a stray signup cookie override a recovery flow", async () => {
    cookiesMock.values.set(
      SIGNUP_NEXT_COOKIE,
      checkoutPathForPlan("founding_lifetime"),
    );
    verifySuccess({ next: checkoutPathForPlan("PRO_ANNUAL") });
    const request = confirmRequest({
      token_hash: "token-hash",
      type: "recovery",
    });

    const response = await GET(request);

    expectRedirect(response, request, RESET_PASSWORD_PATH);
    expectSignupCookieDeleted();
  });

  it("keeps the existing OAuth next cookie behaviour", async () => {
    cookiesMock.values.set(OAUTH_NEXT_COOKIE, "/app/profile");
    cookiesMock.values.set(
      SIGNUP_NEXT_COOKIE,
      checkoutPathForPlan("founding_lifetime"),
    );
    const request = confirmRequest({ code: "auth-code" });

    const response = await GET(request);

    expectRedirect(response, request, "/app/profile");
    expectSignupCookieDeleted();
  });
});
