import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  const gets: string[] = [];
  const deletes: string[] = [];
  const sets: Array<{ name: string; value: string; options?: unknown }> = [];
  const cookieStore = {
    get(name: string) {
      gets.push(name);
      const value = values.get(name);
      return value === undefined ? undefined : { name, value };
    },
    delete(name: string) {
      deletes.push(name);
      values.delete(name);
    },
    set(name: string, value: string, options?: unknown) {
      sets.push({ name, value, options });
      values.set(name, value);
    },
    reset() {
      values.clear();
      gets.length = 0;
      deletes.length = 0;
      sets.length = 0;
    },
  };
  const captureServerEvent = vi.fn(async (event: unknown) => {
    void event;
  });
  const exchangeCodeForSession = vi.fn(async (code: string) => {
    void code;
    return {
      data: { user: null as Record<string, unknown> | null },
      error: null as { message: string } | null,
    };
  });
  return { values, gets, deletes, sets, cookieStore, captureServerEvent, exchangeCodeForSession };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mocks.cookieStore),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      verifyOtp: vi.fn(async () => ({ error: null })),
    },
  })),
}));

vi.mock("@/lib/analytics/server", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

import { GET } from "@/app/auth/callback/route";
import { OAUTH_NEXT_COOKIE, OAUTH_UTM_COOKIE } from "@/lib/auth/cookies";
import { ANALYTICS_CONSENT_COOKIE } from "@/lib/analytics/storage-keys";

const HOST = "www.dealatlas.uk";
const GOOGLE_USER = {
  id: "019a0c1e-9a4d-7c8e-8b1f-2d6e5a7c9b10",
  app_metadata: { provider: "google" },
  created_at: "2026-11-15T10:00:00.000Z",
  last_sign_in_at: "2026-11-15T10:00:00.000Z",
};

type CapturedEvent = {
  properties: Record<string, unknown>;
  setOnce?: Record<string, unknown>;
};

function callbackRequest(query = "") {
  return new NextRequest(`https://${HOST}/auth/callback${query}`);
}

function capturedEvent(): CapturedEvent {
  return mocks.captureServerEvent.mock.calls[0]?.[0] as CapturedEvent;
}

function redirectLocation(response: Response): URL {
  return new URL(response.headers.get("location") ?? "");
}

describe("OAuth callback UTM capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieStore.reset();
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: GOOGLE_USER },
      error: null,
    });
  });

  it("captures sanitised UTMs and set_once for a new Google account with consent", async () => {
    mocks.values.set(OAUTH_UTM_COOKIE, "utm_source= Newsletter &utm_medium=EMAIL&utm_campaign=oct launch");
    mocks.values.set(ANALYTICS_CONSENT_COOKIE, "granted");

    await GET(callbackRequest("?code=abc"));

    expect(mocks.captureServerEvent).toHaveBeenCalledOnce();
    const event = capturedEvent();
    expect(event.properties).toMatchObject({
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "other",
    });
    expect(event.setOnce).toMatchObject({
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "other",
    });
    expect(event.properties).not.toHaveProperty("utm_term");
  });

  it("does not capture without analytics consent", async () => {
    mocks.values.set(OAUTH_UTM_COOKIE, "utm_source=newsletter&utm_medium=email");
    mocks.values.set(ANALYTICS_CONSENT_COOKIE, "denied");

    await GET(callbackRequest("?code=abc"));

    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
  });

  it("always deletes the UTM cookie, including on errors", async () => {
    const scenarios: Array<{ name: string; query: string; setup?: () => void }> = [
      { name: "successful sign-in", query: "?code=abc" },
      { name: "provider error", query: "?error=access_denied" },
      {
        name: "exchange error",
        query: "?code=abc",
        setup: () => {
          mocks.exchangeCodeForSession.mockResolvedValue({
            data: { user: null },
            error: { message: "exchange failed" },
          });
        },
      },
      { name: "invalid link", query: "" },
    ];

    for (const scenario of scenarios) {
      mocks.cookieStore.reset();
      mocks.exchangeCodeForSession.mockResolvedValue({
        data: { user: GOOGLE_USER },
        error: null,
      });
      mocks.values.set(OAUTH_UTM_COOKIE, "utm_source=newsletter");
      scenario.setup?.();

      await GET(callbackRequest(scenario.query));

      expect(mocks.deletes, scenario.name).toContain(OAUTH_UTM_COOKIE);
      expect(mocks.values.has(OAUTH_UTM_COOKIE), scenario.name).toBe(false);
    }
  });

  it("keeps every request-based redirect on the request host", async () => {
    const queries = [
      "?code=abc&next=//evil.example",
      `?code=abc&next=${encodeURIComponent("https://evil.example/x")}`,
      `?code=abc&next=${encodeURIComponent("/\\evil.example")}`,
      "?code=abc&next=%2F%2Fevil.example",
    ];

    for (const query of queries) {
      const response = await GET(callbackRequest(query));
      const location = redirectLocation(response);
      expect(location.host, query).toBe(HOST);
      expect(location.host, query).not.toBe("evil.example");
    }
  });

  it.each(["//evil.example", "https://evil.example"])(
    "keeps redirects on the request host for an OAUTH_NEXT_COOKIE of %s",
    async (cookieNext) => {
      mocks.values.set(OAUTH_NEXT_COOKIE, cookieNext);

      const response = await GET(callbackRequest("?code=abc"));
      const location = redirectLocation(response);

      expect(location.host).toBe(HOST);
      expect(location.host).not.toBe("evil.example");
      expect(mocks.deletes).toContain(OAUTH_NEXT_COOKIE);
    },
  );

  it("never lets the UTM cookie influence the redirect", async () => {
    for (const utmCookie of [
      "utm_source=newsletter&next=%2F%2Fevil.example",
      "utm_source=https%3A%2F%2Fevil.example",
    ]) {
      mocks.cookieStore.reset();
      mocks.values.set(OAUTH_UTM_COOKIE, utmCookie);

      const response = await GET(callbackRequest("?code=abc&next=%2Fpricing"));
      const location = redirectLocation(response);

      expect(location.host).toBe(HOST);
      expect(location.pathname).toBe("/pricing");
    }
  });
});
