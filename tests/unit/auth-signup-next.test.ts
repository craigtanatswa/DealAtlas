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

const redirectMock = vi.hoisted(() => ({ paths: [] as string[] }));

vi.mock("next/headers", () => ({
  cookies: async () => cookiesMock.store,
  headers: async () => new Headers(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirectMock.paths.push(path);
    const error = new Error(`NEXT_REDIRECT:${path}`);
    (error as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${path};307;`;
    throw error;
  },
  forbidden: () => {
    throw new Error("NEXT_FORBIDDEN");
  },
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

vi.mock("@/lib/auth/profile", () => ({
  getProfileForUser: vi.fn(async () => ({})),
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthUser: vi.fn(async () => null),
}));

vi.mock("@/lib/matching/recalculate", () => ({
  queueCompanyProfileMatches: vi.fn(async () => undefined),
}));

vi.mock("@/lib/analytics/server", () => ({
  captureServerEvent: vi.fn(async () => undefined),
}));

import { signUpAction } from "@/lib/auth/actions";
import {
  SIGNUP_NEXT_COOKIE,
  SIGNUP_NEXT_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/auth/cookies";
import {
  AUTH_HOME_PATH,
  NEXT_INVALID_FALLBACK_PATH,
  checkoutPathForPlan,
  resolveSignupNext,
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

function signupForm(next?: string, displayName?: string) {
  const form = new FormData();
  form.set("email", "user@example.com");
  form.set("password", "supersecret1");
  form.set("confirmPassword", "supersecret1");
  if (displayName !== undefined) {
    form.set("displayName", displayName);
  }
  if (next !== undefined) {
    form.set("next", next);
  }
  return form;
}

async function callSignUp(form: FormData): Promise<string | undefined> {
  redirectMock.paths.length = 0;
  try {
    await signUpAction({ error: null, success: null }, form);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.startsWith("NEXT_REDIRECT:")
    ) {
      throw error;
    }
  }
  return redirectMock.paths.at(-1);
}

function signupCookieSet() {
  return cookiesMock.sets.find((entry) => entry.name === SIGNUP_NEXT_COOKIE);
}

function signUpOptions() {
  return authMock.signUp.mock.calls.at(-1)?.[0] as {
    options?: { data?: Record<string, unknown> };
  };
}

describe("resolveSignupNext", () => {
  it("prefers a valid query value over cookie and metadata", () => {
    expect(
      resolveSignupNext({
        query: checkoutPathForPlan("PRO_MONTHLY"),
        cookie: checkoutPathForPlan("PRO_ANNUAL"),
        metadata: checkoutPathForPlan("founding_lifetime"),
        fallback: AUTH_HOME_PATH,
      }),
    ).toBe(checkoutPathForPlan("PRO_MONTHLY"));
  });

  it("uses a valid cookie before metadata", () => {
    expect(
      resolveSignupNext({
        query: null,
        cookie: checkoutPathForPlan("PRO_ANNUAL"),
        metadata: checkoutPathForPlan("founding_lifetime"),
      }),
    ).toBe(checkoutPathForPlan("PRO_ANNUAL"));
  });

  it("uses valid metadata when query and cookie are absent", () => {
    expect(
      resolveSignupNext({
        metadata: checkoutPathForPlan("founding_lifetime"),
      }),
    ).toBe(checkoutPathForPlan("founding_lifetime"));
  });

  it("keeps the query's supplied-but-invalid fallback", () => {
    expect(
      resolveSignupNext({
        query: "https://evil.com",
        cookie: checkoutPathForPlan("PRO_MONTHLY"),
        metadata: checkoutPathForPlan("PRO_ANNUAL"),
      }),
    ).toBe(NEXT_INVALID_FALLBACK_PATH);
  });

  it("ignores invalid cookie and metadata values", () => {
    expect(
      resolveSignupNext({
        cookie: "https://evil.com",
        metadata: "//evil.com",
        fallback: AUTH_HOME_PATH,
      }),
    ).toBe(AUTH_HOME_PATH);
  });

  it("ignores hostile values on every source", () => {
    for (const hostile of HOSTILE_NEXT_VALUES) {
      expect(
        resolveSignupNext({ query: hostile, fallback: AUTH_HOME_PATH }),
        `query ${hostile}`,
      ).toBe(NEXT_INVALID_FALLBACK_PATH);
      expect(
        resolveSignupNext({ cookie: hostile, fallback: AUTH_HOME_PATH }),
        `cookie ${hostile}`,
      ).toBe(AUTH_HOME_PATH);
      expect(
        resolveSignupNext({ metadata: hostile, fallback: AUTH_HOME_PATH }),
        `metadata ${hostile}`,
      ).toBe(AUTH_HOME_PATH);
    }
  });

  it("keeps every checkout plan and its UTM query", () => {
    for (const plan of CHECKOUT_PLAN_KEYS) {
      const next = `${checkoutPathForPlan(plan)}&utm_source=email`;
      expect(resolveSignupNext({ query: next })).toBe(next);
      expect(resolveSignupNext({ cookie: next })).toBe(next);
      expect(resolveSignupNext({ metadata: next })).toBe(next);
    }
  });
});

describe("signUpAction signup next persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.reset();
    redirectMock.paths.length = 0;
    authMock.signUp.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          identities: [{ id: "identity-1" }],
          user_metadata: {},
        },
        session: null,
      },
      error: null,
    });
    authMock.updateUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("stores a valid next in a secure same-site signup cookie and metadata", async () => {
    const next = "/checkout?plan=lifetime&utm_source=newsletter";
    const redirectTo = await callSignUp(signupForm(next, "Ada Lovelace"));

    expect(redirectTo).toBe(
      `/verify-email?email=${encodeURIComponent("user@example.com")}`,
    );
    const cookie = signupCookieSet();
    expect(cookie).toEqual({
      name: SIGNUP_NEXT_COOKIE,
      value: next,
      options: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/auth",
        maxAge: SIGNUP_NEXT_COOKIE_MAX_AGE_SECONDS,
      },
    });
    expect(SIGNUP_NEXT_COOKIE_MAX_AGE_SECONDS).toBe(1800);
    expect(signUpOptions().options?.data).toEqual({
      name: "Ada Lovelace",
      next,
    });
  });

  it("stores a full UTM checkout next intact in the cookie and signUp metadata", async () => {
    const next = "/checkout?plan=lifetime&utm_source=dealatlas&utm_medium=organic&utm_campaign=lifetime&utm_content=deal-page";

    const redirectTo = await callSignUp(signupForm(next));

    expect(redirectTo).toBe(
      `/verify-email?email=${encodeURIComponent("user@example.com")}`,
    );
    expect(signupCookieSet()?.value).toBe(next);
    expect(signUpOptions().options?.data).toEqual({ next });
  });

  it("keeps name metadata when no next was supplied", async () => {
    await callSignUp(signupForm(undefined, "Ada Lovelace"));

    expect(signupCookieSet()).toBeUndefined();
    expect(signUpOptions().options?.data).toEqual({ name: "Ada Lovelace" });
  });

  it("does not store hostile or missing next values", async () => {
    for (const hostile of [...HOSTILE_NEXT_VALUES, ""]) {
      cookiesMock.reset();
      authMock.signUp.mockClear();
      const label = hostile === "" ? "missing" : hostile;

      await callSignUp(
        signupForm(hostile === "" ? undefined : hostile, "Ada Lovelace"),
      );

      expect(signupCookieSet(), label).toBeUndefined();
      expect(signUpOptions().options?.data, label).toEqual({
        name: "Ada Lovelace",
      });
    }
  });

  it("does not clear a good next with a hostile one", async () => {
    await callSignUp(signupForm("https://evil.com"));

    expect(signupCookieSet()).toBeUndefined();
    expect(signUpOptions().options?.data).toEqual({});
  });

  it("redirects straight to next without setting the cookie when a session is returned", async () => {
    const next = "/checkout?plan=PRO_ANNUAL";
    authMock.signUp.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          identities: [{ id: "identity-1" }],
          user_metadata: {},
        },
        session: { access_token: "token" },
      },
      error: null,
    });

    const redirectTo = await callSignUp(signupForm(next));

    expect(redirectTo).toBe(next);
    expect(signupCookieSet()).toBeUndefined();
    expect(signUpOptions().options?.data).toEqual({ next });
  });

  it("does not set the cookie when signUp errors", async () => {
    authMock.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "signup_disabled", message: "Signups are disabled" },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const redirectTo = await callSignUp(signupForm("/checkout?plan=lifetime"));

    expect(redirectTo).toBeUndefined();
    expect(signupCookieSet()).toBeUndefined();
    errorSpy.mockRestore();
  });
});
