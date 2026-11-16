import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookiesMock = vi.hoisted(() => {
  const values = new Map<string, string>();
  const sets: Array<{ name: string; value: string; options?: unknown }> = [];
  const deletes: string[] = [];
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
      set(name: string, value: string, options?: unknown) {
        values.set(name, value);
        sets.push({ name, value, options });
      },
      delete(name: string) {
        deletes.push(name);
        values.delete(name);
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

const fetchMock = vi.hoisted(() =>
  vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    void _input;
    void _init;
    return new Response(null, { status: 200 });
  }),
);

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

import { GET } from "@/app/auth/callback/route";
import {
  ANALYTICS_ANON_ID_FIELD,
  ATTRIBUTION_FIELDS,
} from "@/lib/analytics/attribution";
import {
  buildIdentifyEvent,
  buildUserSignedUpEvent,
} from "@/lib/analytics/server-events";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/lib/analytics/events";
import { ANALYTICS_CONSENT_COOKIE } from "@/lib/analytics/storage-keys";
import { signUpAction } from "@/lib/auth/actions";
import { OAUTH_UTM_COOKIE } from "@/lib/auth/cookies";

const KEY = "phc_TestKey0123456789abcdef";
const USER = "019a0c1e-9a4d-7c8e-8b1f-2d6e5a7c9b10";
const OTHER_USER = "029a0c1e-9a4d-7c8e-8b1f-2d6e5a7c9b11";
const ANON = "019a0c1e-1111-7111-8111-111111111111";
const CREATED_AT = "2026-11-15T10:00:00.000Z";

type CapturedBody = {
  api_key: string;
  event: string;
  distinct_id: string;
  uuid: string;
  timestamp: string;
  properties: Record<string, unknown>;
};

function googleUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER,
    user_metadata: {},
    app_metadata: { provider: "google" },
    created_at: CREATED_AT,
    last_sign_in_at: CREATED_AT,
    ...overrides,
  };
}

function signupForm(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("email", "buyer@example.com");
  form.set("password", "supersecret1");
  form.set("confirmPassword", "supersecret1");
  for (const [name, value] of Object.entries(fields)) {
    form.set(name, value);
  }
  return form;
}

async function runSignUp(fields: Record<string, string> = {}) {
  try {
    await signUpAction({ error: null, success: null }, signupForm(fields));
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("NEXT_REDIRECT:")) {
      throw error;
    }
  }
}

function runCallback() {
  return GET(new NextRequest("https://www.dealatlas.uk/auth/callback?code=abc"));
}

function oauthCookie(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

function capturedBodies(): CapturedBody[] {
  return fetchMock.mock.calls.map((call) => {
    const init = call[1] as RequestInit | undefined;
    return JSON.parse(String(init?.body)) as CapturedBody;
  });
}

const UNSORTED_TOP_LEVEL = [
  "api_key",
  "distinct_id",
  "event",
  "properties",
  "timestamp",
  "uuid",
];

beforeEach(() => {
  vi.clearAllMocks();
  cookiesMock.reset();
  redirectMock.paths.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", KEY);
  vi.stubEnv("DEALATLAS_ANALYTICS_UPSTREAM", "");
  authMock.signUp.mockResolvedValue({
    data: {
      user: {
        id: USER,
        identities: [{ id: "identity-1" }],
        user_metadata: {},
      },
      session: null,
    },
    error: null,
  });
  authMock.exchangeCodeForSession.mockResolvedValue({
    data: { user: googleUser() },
    error: null,
  });
  authMock.verifyOtp.mockResolvedValue({
    data: { user: null, session: null },
    error: null,
  });
  authMock.updateUser.mockResolvedValue({ data: { user: null }, error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("P5 signup analytics consent and anonymous-id join", () => {
  it("S&B-1: signUpAction sends nothing when the consent cookie is denied, even with a granted form", async () => {
    cookiesMock.values.set(ANALYTICS_CONSENT_COOKIE, "denied");

    await runSignUp({
      [ATTRIBUTION_FIELDS.consent]: "granted",
      [ANALYTICS_ANON_ID_FIELD]: ANON,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("S&B-1: auth callback sends nothing when the consent cookie is denied, even with granted form consent carried in the OAuth cookie", async () => {
    cookiesMock.values.set(ANALYTICS_CONSENT_COOKIE, "denied");
    cookiesMock.values.set(
      OAUTH_UTM_COOKIE,
      oauthCookie({ consent: "granted", anon_id: ANON }),
    );

    await runCallback();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("S&B-2: signUpAction sends nothing for missing or unknown consent", async () => {
    await runSignUp({ [ANALYTICS_ANON_ID_FIELD]: ANON });
    expect(fetchMock).not.toHaveBeenCalled();

    cookiesMock.values.set(ANALYTICS_CONSENT_COOKIE, "unknown");
    await runSignUp({ [ANALYTICS_ANON_ID_FIELD]: ANON });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("S&B-2: auth callback sends nothing for missing or unknown consent", async () => {
    cookiesMock.values.set(
      OAUTH_UTM_COOKIE,
      oauthCookie({ anon_id: ANON }),
    );
    await runCallback();
    expect(fetchMock).not.toHaveBeenCalled();

    cookiesMock.reset();
    cookiesMock.values.set(ANALYTICS_CONSENT_COOKIE, "unknown");
    cookiesMock.values.set(
      OAUTH_UTM_COOKIE,
      oauthCookie({ anon_id: ANON }),
    );
    await runCallback();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid", "not-a-uuid"],
    ["missing", undefined],
    ["equal to the user id", USER],
  ])(
    "S&B-3: signUpAction with an %s anon id still sends user_signed_up but no $identify",
    async (_label, anonId) => {
      cookiesMock.values.set(ANALYTICS_CONSENT_COOKIE, "granted");
      const fields: Record<string, string> = {};
      if (anonId !== undefined) {
        fields[ANALYTICS_ANON_ID_FIELD] = anonId;
      }

      await runSignUp(fields);

      const bodies = capturedBodies();
      expect(bodies).toHaveLength(1);
      expect(bodies[0]!.event).toBe("user_signed_up");
    },
  );

  it.each([
    ["invalid", "not-a-uuid"],
    ["missing", undefined],
    ["equal to the user id", USER],
  ])(
    "S&B-3: auth callback with an %s anon id still sends user_signed_up but no $identify",
    async (_label, anonId) => {
      cookiesMock.values.set(ANALYTICS_CONSENT_COOKIE, "granted");
      const fields: Record<string, string> = {};
      if (anonId !== undefined) {
        fields.anon_id = anonId;
      }
      cookiesMock.values.set(OAUTH_UTM_COOKIE, oauthCookie(fields));

      await runCallback();

      const bodies = capturedBodies();
      expect(bodies).toHaveLength(1);
      expect(bodies[0]!.event).toBe("user_signed_up");
    },
  );

  it("S&B-4: capture body keys equal the allowlist exactly for user_signed_up and $identify", async () => {
    cookiesMock.values.set(ANALYTICS_CONSENT_COOKIE, "granted");

    await runSignUp({
      [ATTRIBUTION_FIELDS.firstTouchLandingPath]:
        "/deals/canary-deal-a1b2c3?q=CANARY#apply",
      [ATTRIBUTION_FIELDS.firstTouchReferrerDomain]:
        "https://www.google.com/search?q=CANARY+BUYER",
      [ATTRIBUTION_FIELDS.firstTouchGuideCtaPosition]: "after_answer",
      [ATTRIBUTION_FIELDS.firstTouchGuideCtaTarget]: "signup",
      [ATTRIBUTION_FIELDS.utm_source]: "newsletter",
      [ATTRIBUTION_FIELDS.utm_medium]: "email",
      [ATTRIBUTION_FIELDS.utm_campaign]: "oct-launch",
      [ATTRIBUTION_FIELDS.utm_term]: "council tenders",
      [ATTRIBUTION_FIELDS.utm_content]: "hero cta",
      [ATTRIBUTION_FIELDS.signupSourceGuide]: "uk-tender-search",
      [ANALYTICS_ANON_ID_FIELD]: ANON,
      email: "buyer.canary@example.com",
      name: "CANARY NAME",
      ip: "203.0.113.77",
      ua: "CanaryUA/1.0",
      next: "/checkout?plan=canary_lifetime",
      plan: "canary_plan",
    });

    const bodies = capturedBodies();
    expect(bodies).toHaveLength(2);
    const [signedUp, identify] = bodies as [CapturedBody, CapturedBody];

    expect(signedUp.event).toBe("user_signed_up");
    expect(identify.event).toBe("$identify");
    expect(signedUp.distinct_id).toBe(USER);
    expect(identify.distinct_id).toBe(USER);
    expect(signedUp.api_key).toBe(KEY);
    expect(identify.api_key).toBe(KEY);

    for (const body of bodies) {
      expect(Object.keys(body).sort()).toEqual([...UNSORTED_TOP_LEVEL].sort());
    }

    expect(Object.keys(signedUp.properties).sort()).toEqual(
      [
        "$geoip_disable",
        "$lib",
        "$set_once",
        "first_touch_guide_cta",
        "first_touch_landing_path",
        "first_touch_referrer_domain",
        "signup_source_guide",
        "utm_campaign",
        "utm_content",
        "utm_medium",
        "utm_source",
        "utm_term",
      ].sort(),
    );
    expect(Object.keys(signedUp.properties.$set_once as object).sort()).toEqual(
      [
        "first_touch_guide_cta",
        "first_touch_landing_path",
        "first_touch_referrer_domain",
        "utm_campaign",
        "utm_content",
        "utm_medium",
        "utm_source",
        "utm_term",
      ].sort(),
    );
    expect(Object.keys(identify.properties).sort()).toEqual(
      ["$anon_distinct_id", "$geoip_disable", "$lib"].sort(),
    );
    expect(identify.properties.$anon_distinct_id).toBe(ANON);
    expect(signedUp.properties.$lib).toBe("dealatlas-server");
    expect(identify.properties.$lib).toBe("dealatlas-server");
    expect(signedUp.properties.$geoip_disable).toBe(true);
    expect(identify.properties.$geoip_disable).toBe(true);

    const serialised = JSON.stringify(bodies).toLowerCase();
    for (const forbidden of [
      "canary",
      "buyer.canary@example.com",
      "canary name",
      "203.0.113.77",
      "canaryua",
      "plan=canary",
      "canary_lifetime",
      "canary_plan",
      "canary-deal-a1b2c3",
      "google.com",
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("S&B-4: $identify is a server-only event and never a client event", () => {
    expect(SERVER_EVENTS).toContain("$identify");
    expect(CLIENT_EVENTS as readonly string[]).not.toContain("$identify");
  });

  it("S&B-5: retries keep each event's deterministic uuid and different users get different uuids", async () => {
    const signedUp = buildUserSignedUpEvent({ userId: USER });
    const signedUpRetry = buildUserSignedUpEvent({ userId: USER });
    const identify = buildIdentifyEvent({ userId: USER, anonId: ANON });
    const identifyRetry = buildIdentifyEvent({ userId: USER, anonId: ANON });
    const otherIdentify = buildIdentifyEvent({ userId: OTHER_USER, anonId: ANON });

    expect(signedUp!.uuid).toBe(signedUpRetry!.uuid);
    expect(identify!.uuid).toBe(identifyRetry!.uuid);
    expect(signedUp!.uuid).not.toBe(identify!.uuid);
    expect(identify!.uuid).not.toBe(otherIdentify!.uuid);

    cookiesMock.values.set(ANALYTICS_CONSENT_COOKIE, "granted");
    await runSignUp({ [ANALYTICS_ANON_ID_FIELD]: ANON });
    const first = capturedBodies();
    fetchMock.mockClear();
    await runSignUp({ [ANALYTICS_ANON_ID_FIELD]: ANON });
    const second = capturedBodies();

    expect(second.map((body) => [body.event, body.uuid])).toEqual(
      first.map((body) => [body.event, body.uuid]),
    );
  });

  it("S&B-6: a repeat sign-up for an existing email sends nothing", async () => {
    cookiesMock.values.set(ANALYTICS_CONSENT_COOKIE, "granted");
    authMock.signUp.mockResolvedValue({
      data: {
        user: { id: USER, identities: [], user_metadata: {} },
        session: null,
      },
      error: null,
    });

    await runSignUp({
      [ATTRIBUTION_FIELDS.consent]: "granted",
      [ANALYTICS_ANON_ID_FIELD]: ANON,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("S&B-6: an existing Google account signing in again sends nothing", async () => {
    cookiesMock.values.set(ANALYTICS_CONSENT_COOKIE, "granted");
    cookiesMock.values.set(
      OAUTH_UTM_COOKIE,
      oauthCookie({ anon_id: ANON }),
    );
    authMock.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: googleUser({
          created_at: "2026-01-01T00:00:00.000Z",
          last_sign_in_at: "2026-11-15T10:00:00.000Z",
        }),
      },
      error: null,
    });

    await runCallback();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("S&B-3/4: a valid anon id produces one $identify join with only the anonymous id", async () => {
    cookiesMock.values.set(ANALYTICS_CONSENT_COOKIE, "granted");

    await runSignUp({ [ANALYTICS_ANON_ID_FIELD]: ANON });

    const bodies = capturedBodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!.event).toBe("$identify");
    expect(bodies[1]!.properties).toEqual({
      $anon_distinct_id: ANON,
      $lib: "dealatlas-server",
      $geoip_disable: true,
    });
    expect(bodies[1]!.uuid).toBe(buildIdentifyEvent({ userId: USER, anonId: ANON })!.uuid);
  });

  it("S&B-3/4: a valid Google anon id in the OAuth cookie produces the $identify join", async () => {
    cookiesMock.values.set(ANALYTICS_CONSENT_COOKIE, "granted");
    cookiesMock.values.set(
      OAUTH_UTM_COOKIE,
      oauthCookie({ utm_source: "newsletter", anon_id: ANON }),
    );

    await runCallback();

    const bodies = capturedBodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[0]!.event).toBe("user_signed_up");
    expect(bodies[1]!.event).toBe("$identify");
    expect(bodies[1]!.distinct_id).toBe(USER);
    expect(bodies[1]!.properties).toEqual({
      $anon_distinct_id: ANON,
      $lib: "dealatlas-server",
      $geoip_disable: true,
    });
  });

  it("S&B-2: form consent carried through the OAuth cookie is enough when the consent cookie is absent", async () => {
    cookiesMock.values.set(
      OAUTH_UTM_COOKIE,
      oauthCookie({ consent: "granted", anon_id: ANON }),
    );

    await runCallback();

    const bodies = capturedBodies();
    expect(bodies.map((body) => body.event)).toEqual(["user_signed_up", "$identify"]);
  });
});
