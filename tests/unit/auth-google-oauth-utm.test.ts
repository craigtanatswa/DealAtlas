import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  const sets: Array<{ name: string; value: string; options?: unknown }> = [];
  const deletes: string[] = [];
  const cookieStore = {
    get(name: string) {
      const value = values.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string, options?: unknown) {
      sets.push({ name, value, options });
      values.set(name, value);
    },
    delete(name: string) {
      deletes.push(name);
      values.delete(name);
    },
    reset() {
      values.clear();
      sets.length = 0;
      deletes.length = 0;
    },
  };
  const redirect = vi.fn();
  const signInWithOAuth = vi.fn(async (options: unknown) => {
    void options;
    return {
      data: { url: "https://accounts.google.com/o/oauth2/auth" },
      error: null,
    };
  });
  return { values, sets, deletes, cookieStore, redirect, signInWithOAuth };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mocks.cookieStore),
  headers: vi.fn(async () => new Headers({ origin: "https://www.dealatlas.uk" })),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/urls", () => ({
  authCallbackUrl: () => "https://www.dealatlas.uk/auth/callback",
  authCallbackUrlForRequest: () => "https://www.dealatlas.uk/auth/callback",
  authResetCallbackUrl: () =>
    "https://www.dealatlas.uk/auth/callback?next=/reset-password",
}));
vi.mock("@/lib/auth/profile", () => ({ getProfileForUser: vi.fn(async () => null) }));
vi.mock("@/lib/auth/session", () => ({ getAuthUser: vi.fn(async () => null) }));
vi.mock("@/lib/matching/recalculate", () => ({
  queueCompanyProfileMatches: vi.fn(async () => {}),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { signInWithOAuth: mocks.signInWithOAuth },
  })),
}));

import { signInWithGoogleAction } from "@/lib/auth/actions";
import { ANALYTICS_ANON_ID_FIELD, ATTRIBUTION_FIELDS } from "@/lib/analytics/attribution";
import { ANALYTICS_CONSENT_COOKIE } from "@/lib/analytics/storage-keys";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_NEXT_COOKIE_MAX_AGE_SECONDS,
  OAUTH_UTM_COOKIE,
} from "@/lib/auth/cookies";

const ANON_ID = "019a0c1e-1111-7111-8111-111111111111";

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

async function startGoogleSignIn(fields: Record<string, string>) {
  await signInWithGoogleAction(
    { error: null, success: null },
    form({ next: "/app", ...fields }),
  );
}

function utmSetCall() {
  return mocks.sets.find((call) => call.name === OAUTH_UTM_COOKIE);
}

describe("signInWithGoogleAction UTM cookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieStore.reset();
  });

  it("sets the UTM cookie with the next-cookie options when consent is granted", async () => {
    mocks.values.set(ANALYTICS_CONSENT_COOKIE, "granted");

    await startGoogleSignIn({
      [ATTRIBUTION_FIELDS.utm_source]: " Newsletter ",
      [ATTRIBUTION_FIELDS.utm_medium]: "EMAIL",
      [ATTRIBUTION_FIELDS.utm_campaign]: "Oct Launch",
    });

    const call = utmSetCall();
    expect(call?.value).toBe("utm_source=newsletter&utm_medium=email&utm_campaign=other");
    expect(call?.options).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_NEXT_COOKIE_MAX_AGE_SECONDS,
      secure: false,
    });
    expect(mocks.sets.find((entry) => entry.name === OAUTH_NEXT_COOKIE)?.value).toBe("/app");
    expect(mocks.redirect).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/auth");
  });

  it("accepts the form consent field as well as the consent cookie", async () => {
    await startGoogleSignIn({
      [ATTRIBUTION_FIELDS.consent]: "granted",
      [ATTRIBUTION_FIELDS.utm_source]: "newsletter",
    });

    expect(utmSetCall()?.value).toBe("utm_source=newsletter&consent=granted");
  });

  it("ignores a granted form when the consent cookie is denied", async () => {
    mocks.values.set(ANALYTICS_CONSENT_COOKIE, "denied");

    await startGoogleSignIn({
      [ATTRIBUTION_FIELDS.consent]: "granted",
      [ATTRIBUTION_FIELDS.utm_source]: "newsletter",
      [ANALYTICS_ANON_ID_FIELD]: ANON_ID,
    });

    expect(utmSetCall()).toBeUndefined();
    expect(mocks.deletes).toContain(OAUTH_UTM_COOKIE);
  });

  it("carries the anonymous id in the existing UTM cookie", async () => {
    mocks.values.set(ANALYTICS_CONSENT_COOKIE, "granted");

    await startGoogleSignIn({ [ANALYTICS_ANON_ID_FIELD]: ANON_ID });

    const params = new URLSearchParams(utmSetCall()?.value);
    expect(params.get("anon_id")).toBe(ANON_ID);
  });

  it("does not set or keep the UTM cookie without consent", async () => {
    mocks.values.set(OAUTH_UTM_COOKIE, "utm_source=stale");

    await startGoogleSignIn({
      [ATTRIBUTION_FIELDS.utm_source]: "newsletter",
      [ATTRIBUTION_FIELDS.utm_medium]: "email",
    });

    expect(utmSetCall()).toBeUndefined();
    expect(mocks.deletes).toContain(OAUTH_UTM_COOKIE);
    expect(mocks.values.has(OAUTH_UTM_COOKIE)).toBe(false);
  });

  it("deletes a stale UTM cookie when consent is granted but no UTMs are present", async () => {
    mocks.values.set(ANALYTICS_CONSENT_COOKIE, "granted");
    mocks.values.set(OAUTH_UTM_COOKIE, "utm_source=stale");

    await startGoogleSignIn({});

    expect(utmSetCall()).toBeUndefined();
    expect(mocks.deletes).toContain(OAUTH_UTM_COOKIE);
    expect(mocks.values.has(OAUTH_UTM_COOKIE)).toBe(false);
  });
});

describe("signInWithGoogleAction cookie security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieStore.reset();
    mocks.values.set(ANALYTICS_CONSENT_COOKIE, "granted");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function oauthSetCalls() {
    return [
      mocks.sets.find((call) => call.name === OAUTH_NEXT_COOKIE),
      mocks.sets.find((call) => call.name === OAUTH_UTM_COOKIE),
    ];
  }

  it("sets both cookies with secure: true in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await startGoogleSignIn({ [ATTRIBUTION_FIELDS.utm_source]: "newsletter" });

    const calls = oauthSetCalls();
    expect(calls[0]?.options).toMatchObject({ secure: true });
    expect(calls[1]?.options).toMatchObject({ secure: true });
  });

  it.each(["test", "development"])(
    "sets both cookies with secure: false in %s",
    async (nodeEnv) => {
      vi.stubEnv("NODE_ENV", nodeEnv);

      await startGoogleSignIn({ [ATTRIBUTION_FIELDS.utm_source]: "newsletter" });

      const calls = oauthSetCalls();
      expect(calls[0]?.options).toMatchObject({ secure: false });
      expect(calls[1]?.options).toMatchObject({ secure: false });
    },
  );

  it("sets httpOnly and sameSite lax on both cookies", async () => {
    await startGoogleSignIn({ [ATTRIBUTION_FIELDS.utm_source]: "newsletter" });

    for (const call of oauthSetCalls()) {
      expect(call?.options).toMatchObject({ httpOnly: true, sameSite: "lax" });
    }
  });
});
