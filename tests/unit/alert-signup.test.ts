vi.mock("server-only", () => ({}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleAlertConfirm,
  handleAlertSignup,
  handleAlertUnsubscribe,
} from "@/lib/alerts/signup/service";
import {
  hashAlertToken,
  mintConfirmToken,
  mintUnsubscribeToken,
  mintUserDigestUnsubscribeToken,
  verifyUnsubscribeToken,
  verifyUnsubscribeTokenAny,
} from "@/lib/alerts/signup/tokens";
import { normalizeAlertEmail } from "@/lib/alerts/signup/normalize";
import { renderAlertConfirmationEmail } from "@/lib/alerts/signup/confirmation-email";
import { toAlertDto, type PublishedAlertPreviews } from "@/lib/alerts/dto";
import type { AlertRecord } from "@/lib/alerts/types";
import { FREE_ENTITLEMENT } from "@/lib/entitlements/policy";
import { PLANS } from "@/lib/constants";
import { renderAlertDigest } from "@/lib/email/render";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import { findProtectedMarkerLeaks } from "../helpers/protected-leak";

const SECRET = "a".repeat(32);
const ENV = {
  ALERT_TOKEN_SECRET: SECRET,
  NEXT_PUBLIC_APP_URL: "https://dealatlas.uk",
};

function request(ip = "203.0.113.10"): Request {
  return new Request("https://dealatlas.uk/api/alerts/signup", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

type RpcResult = { allowed: boolean; remaining: number; reset_at: string };

function makeAdmin(options?: {
  rate?: RpcResult;
  count?: number;
  insertId?: string;
  confirmRow?: Record<string, unknown> | null;
  profileId?: string | null;
}) {
  const rate: RpcResult = options?.rate ?? {
    allowed: true,
    remaining: 4,
    reset_at: new Date(Date.now() + 600_000).toISOString(),
  };
  const insertId = options?.insertId ?? "11111111-1111-4111-8111-111111111111";
  const state = {
    inserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    sent: [] as { to: string; subject: string; text: string; html: string }[],
  };

  const chain = (result: unknown) => {
    const api: Record<string, unknown> = {};
    const self = () => api;
    api.select = vi.fn(self);
    api.insert = vi.fn((row: Record<string, unknown>) => {
      state.inserts.push(row);
      return api;
    });
    api.update = vi.fn((row: Record<string, unknown>) => {
      state.updates.push(row);
      return api;
    });
    api.upsert = vi.fn(self);
    api.eq = vi.fn(self);
    api.in = vi.fn(self);
    api.neq = vi.fn(self);
    api.order = vi.fn(self);
    api.limit = vi.fn(self);
    api.maybeSingle = vi.fn(async () => ({ data: result, error: null }));
    api.single = vi.fn(async () => ({ data: result, error: null }));
    api.then = undefined;
    return api;
  };

  const admin = {
    rpc: vi.fn(async () => ({ data: [rate], error: null })),
    from: vi.fn((table: string) => {
      if (table === "alert_email_subscriptions") {
        const api: Record<string, unknown> = {};
        const self = () => api;
        api.select = vi.fn((cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) {
            return {
              eq: vi.fn().mockReturnValue({
                in: vi.fn(async () => ({
                  count: options?.count ?? 0,
                  error: null,
                })),
              }),
            };
          }
          return api;
        });
        api.insert = vi.fn((row: Record<string, unknown>) => {
          state.inserts.push(row);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: insertId }, error: null })),
            })),
          };
        });
        api.update = vi.fn((row: Record<string, unknown>) => {
          state.updates.push(row);
          const terminal = Promise.resolve({ data: null, error: null });
          const chain: Record<string, unknown> = {};
          chain.eq = vi.fn(() => chain);
          chain.neq = vi.fn(() => chain);
          chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            terminal.then(onFulfilled, onRejected);
          return chain;
        });
        api.eq = vi.fn(self);
        api.in = vi.fn(self);
        api.order = vi.fn(self);
        api.limit = vi.fn(self);
        api.maybeSingle = vi.fn(async () => ({
          data: options?.confirmRow ?? null,
          error: null,
        }));
        api.single = vi.fn(async () => ({ data: { id: insertId }, error: null }));
        return api;
      }
      if (table === "deal_previews") {
        const terminal = {
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        };
        const eq4 = vi.fn(() => terminal);
        const eq3 = vi.fn(() => ({ eq: eq4 }));
        const eq2 = vi.fn(() => ({ eq: eq3 }));
        const eq1 = vi.fn(() => ({ eq: eq2 }));
        return { select: vi.fn(() => ({ eq: eq1 })) };
      }
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: options?.profileId ? { id: options.profileId } : null,
                error: null,
              })),
            })),
          })),
          upsert: vi.fn(async () => ({ data: null, error: null })),
        };
      }
      if (table === "notification_preferences") {
        return {
          upsert: vi.fn(async () => ({ data: null, error: null })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
        };
      }
      if (table === "saved_searches") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
          insert: vi.fn(async () => ({ data: null, error: null })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
        };
      }
      return chain(null);
    }),
    auth: {
      admin: {
        createUser: vi.fn(async () => ({
          data: {
            user: {
              id: options?.profileId ?? "22222222-2222-4222-8222-222222222222",
            },
          },
          error: null,
        })),
      },
    },
  };

  return { admin, state };
}

describe("alert signup tokens", () => {
  it("normalises email", () => {
    expect(normalizeAlertEmail("  Foo@Example.COM ")).toBe("foo@example.com");
    expect(normalizeAlertEmail(null)).toBeNull();
  });

  it("mints and verifies confirm and unsubscribe tokens", () => {
    const confirm = mintConfirmToken(ENV);
    expect(confirm.hash).toBe(hashAlertToken(confirm.token, ENV));
    expect(confirm.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const subId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const unsub = mintUnsubscribeToken(subId, ENV);
    expect(verifyUnsubscribeToken(unsub.token, ENV)?.subscriptionId).toBe(subId);
    expect(verifyUnsubscribeTokenAny(unsub.token, ENV)).toEqual({
      kind: "subscription",
      subscriptionId: subId,
    });

    const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const userTok = mintUserDigestUnsubscribeToken(userId, ENV);
    expect(verifyUnsubscribeTokenAny(userTok.token, ENV)).toEqual({
      kind: "user",
      userId,
    });
  });

  it("rejects expired unsubscribe tokens", () => {
    const subId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const minted = mintUnsubscribeToken(subId, ENV, 1_700_000_000);
    expect(verifyUnsubscribeToken(minted.token, ENV, 1_700_000_000 + 400 * 24 * 3600)).toBeNull();
  });
});

describe("handleAlertSignup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for missing consent and invalid email", async () => {
    const { admin } = makeAdmin();
    const badConsent = await handleAlertSignup({
      request: request(),
      body: { email: "a@b.co", consent: false },
      admin: admin as never,
      env: ENV,
    });
    expect(badConsent).toEqual({
      status: 400,
      body: { error: "CONSENT_REQUIRED" },
    });

    const badEmail = await handleAlertSignup({
      request: request(),
      body: { email: "not-an-email", consent: true },
      admin: admin as never,
      env: ENV,
    });
    expect(badEmail).toEqual({
      status: 400,
      body: { error: "INVALID_EMAIL" },
    });
  });

  it("returns enumeration-safe 202 for honeypot without side effects", async () => {
    const { admin, state } = makeAdmin();
    const result = await handleAlertSignup({
      request: request(),
      body: {
        email: "bot@example.com",
        consent: true,
        website: "http://spam.example",
      },
      admin: admin as never,
      env: ENV,
      sender: { send: vi.fn(async () => ({ id: null, skipped: true })) },
    });
    expect(result).toEqual({ status: 202, body: { status: "pending" } });
    expect(state.inserts).toHaveLength(0);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("returns 429 when the IP burst limit is exceeded", async () => {
    const { admin } = makeAdmin({
      rate: {
        allowed: false,
        remaining: 0,
        reset_at: new Date(Date.now() + 120_000).toISOString(),
      },
    });
    const result = await handleAlertSignup({
      request: request(),
      body: { email: "person@example.com", consent: true },
      admin: admin as never,
      env: ENV,
    });
    expect(result.status).toBe(429);
    if (result.status === 429) {
      expect(result.body.error).toBe("RATE_LIMITED");
      expect(result.retryAfter).toBeGreaterThan(0);
    }
  });

  it("returns 202 and creates a pending subscription for a valid signup", async () => {
    const { admin, state } = makeAdmin({ count: 0 });
    const send = vi.fn(async (message: {
      subject: string;
      text: string;
      html: string;
    }) => {
      state.sent.push({ to: "x", ...message });
      return { id: "msg_1", skipped: false };
    });
    const result = await handleAlertSignup({
      request: request(),
      body: {
        email: "  New.User@Example.com ",
        consent: true,
        dealSlug: "unknown-slug",
        source: "deal_page",
      },
      admin: admin as never,
      env: ENV,
      sender: { send },
    });
    expect(result).toEqual({ status: 202, body: { status: "pending" } });
    expect(state.inserts[0]?.email_normalized).toBe("new.user@example.com");
    expect(state.inserts[0]?.status).toBe("pending");
    expect(send).toHaveBeenCalledOnce();
    const payload = state.sent[0]!;
    expect(payload.text).not.toMatch(/buyer|portal|notice/i);
    expect(payload.html).toContain("/api/alerts/confirm?token=");
  });

  it("soft-202s without creating when ALERT_TOKEN_SECRET is missing", async () => {
    const { admin, state } = makeAdmin();
    const result = await handleAlertSignup({
      request: request(),
      body: { email: "person@example.com", consent: true },
      admin: admin as never,
      env: { NEXT_PUBLIC_APP_URL: "https://dealatlas.uk" },
      sender: { send: vi.fn(async () => ({ id: null, skipped: true })) },
    });
    expect(result).toEqual({ status: 202, body: { status: "pending" } });
    expect(state.inserts).toHaveLength(0);
  });
});

describe("confirm and unsubscribe", () => {
  it("confirms a valid token and is idempotent when already active", async () => {
    const confirm = mintConfirmToken(ENV);
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      email_normalized: "person@example.com",
      status: "pending",
      main_category: "Technology",
      broad_region: "London",
      user_id: null,
      confirm_token_hash: confirm.hash,
      confirm_expires_at: confirm.expiresAt.toISOString(),
      unsubscribe_token_hash: "x".repeat(64),
      confirmation_email_count: 1,
      last_confirmation_sent_at: null,
    };
    const { admin } = makeAdmin({
      confirmRow: row,
      profileId: "22222222-2222-4222-8222-222222222222",
    });
    const first = await handleAlertConfirm({
      token: confirm.token,
      admin: admin as never,
      env: ENV,
    });
    expect(first.redirectTo).toBe("/alerts/confirmed");

    const active = { ...row, status: "active", user_id: "22222222-2222-4222-8222-222222222222" };
    const { admin: admin2 } = makeAdmin({ confirmRow: active });
    const second = await handleAlertConfirm({
      token: confirm.token,
      admin: admin2 as never,
      env: ENV,
    });
    expect(second.redirectTo).toBe("/alerts/confirmed");
  });

  it("rejects expired confirm tokens", async () => {
    const confirm = mintConfirmToken(ENV);
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      email_normalized: "person@example.com",
      status: "pending",
      main_category: null,
      broad_region: null,
      user_id: null,
      confirm_token_hash: confirm.hash,
      confirm_expires_at: new Date(Date.now() - 60_000).toISOString(),
      unsubscribe_token_hash: "x".repeat(64),
      confirmation_email_count: 1,
      last_confirmation_sent_at: null,
    };
    const { admin } = makeAdmin({ confirmRow: row });
    const result = await handleAlertConfirm({
      token: confirm.token,
      admin: admin as never,
      env: ENV,
    });
    expect(result.redirectTo).toBe("/alerts/confirmed?status=invalid");
  });

  it("unsubscribes via subscription and user tokens", async () => {
    const subId = "11111111-1111-4111-8111-111111111111";
    const minted = mintUnsubscribeToken(subId, ENV);
    const { admin } = makeAdmin({
      confirmRow: {
        id: subId,
        status: "active",
        user_id: "22222222-2222-4222-8222-222222222222",
        unsubscribe_token_hash: minted.hash,
      },
    });
    const result = await handleAlertUnsubscribe({
      token: minted.token,
      admin: admin as never,
      env: ENV,
    });
    expect(result.redirectTo).toBe("/alerts/unsubscribed");

    const userTok = mintUserDigestUnsubscribeToken(
      "22222222-2222-4222-8222-222222222222",
      ENV,
    );
    const { admin: admin2 } = makeAdmin();
    const userResult = await handleAlertUnsubscribe({
      token: userTok.token,
      admin: admin2 as never,
      env: ENV,
    });
    expect(userResult.redirectTo).toBe("/alerts/unsubscribed");
  });
});

describe("free vs Pro alert email anti-bypass", () => {
  const RECORD: AlertRecord = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    deal_id: "22222222-2222-4222-8222-222222222222",
    alert_type: "DEADLINE",
    status: "UNREAD",
    title: "Closing window approaching",
    message: "A saved opportunity is entering a closing window.",
    protected_payload: {
      previewTitle: "Managed IT support for a public organisation",
      sourceTitle: "CANARY SOURCE TITLE NEVER FREE",
      buyerName: "CANARY BUYER NEVER FREE",
      sourceUrl: "https://canary-source.example/notice/ABC-123",
      exactDeadline: "1 July 2026",
      reference: "CANARY-REF-999",
    },
    created_at: "2026-09-15T12:00:00.000Z",
    read_at: null,
    sent_at: null,
    dedupe_key: "DEADLINE:22222222-2222-4222-8222-222222222222:7",
  };

  const PUBLISHED: PublishedAlertPreviews = new Map([
    [
      "22222222-2222-4222-8222-222222222222",
      {
        previewTitle: "Managed IT support for a public organisation",
        deadlineBand: "Within 7 days",
        valueBand: "£250k–£500k",
        category: "Technology",
        region: "South East England",
      },
    ],
  ]);

  const PRO: EntitlementSnapshot = {
    plan: PLANS.PRO,
    status: "ACTIVE",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    billingInterval: "MONTHLY",
    planKey: "PRO_MONTHLY",
  };

  it("keeps free subscriber alert email free of protected values and keys", () => {
    const dto = toAlertDto(RECORD, FREE_ENTITLEMENT, PUBLISHED);
    const digest = renderAlertDigest({
      plan: PLANS.FREE,
      alerts: [dto],
      appUrl: "https://dealatlas.uk",
      unsubscribeUrl: "https://dealatlas.uk/api/alerts/unsubscribe?token=test",
    });
    const blob = `${digest.subject}\n${digest.text}\n${digest.html}`;
    expect(findProtectedMarkerLeaks(blob)).toEqual([]);
    expect(blob).not.toContain("CANARY");
    expect(blob).not.toContain("canary-source.example");
    expect(blob).not.toContain("CANARY-REF-999");
    expect(blob).not.toContain("buyerName");
    expect(blob).not.toContain("sourceUrl");
    expect(blob).not.toContain("sourceTitle");
    expect(digest.headers?.["List-Unsubscribe"]).toContain("unsubscribe");
  });

  it("leaves Pro subscriber alert email with paid details", () => {
    const dto = toAlertDto(RECORD, PRO, PUBLISHED);
    const digest = renderAlertDigest({
      plan: PLANS.PRO,
      alerts: [dto],
      appUrl: "https://dealatlas.uk",
      unsubscribeUrl: "https://dealatlas.uk/api/alerts/unsubscribe?token=test",
    });
    expect(digest.text).toContain("CANARY SOURCE TITLE NEVER FREE");
    expect(digest.text).toContain("CANARY BUYER NEVER FREE");
    expect(digest.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });

  it("confirmation email never includes deal source identity", () => {
    const email = renderAlertConfirmationEmail({
      appUrl: "https://dealatlas.uk",
      confirmUrl: "https://dealatlas.uk/api/alerts/confirm?token=abc",
      categoryName: "Technology",
    });
    const blob = `${email.subject}\n${email.text}\n${email.html}`;
    expect(blob).toContain("Technology");
    expect(blob).not.toContain("CANARY");
    expect(blob).not.toMatch(/https?:\/\/(?!dealatlas\.uk)/i);
  });
});
