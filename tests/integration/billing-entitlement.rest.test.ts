import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getAllowedProductIds } from "@/lib/billing/allowed-products";
import { isProEntitlement, resolveEntitlement } from "@/lib/entitlements";
import type { SubscriptionMirror } from "@/lib/entitlements/types";

const url = process.env.DEALATLAS_DB_TEST_URL;
const anonKey = process.env.DEALATLAS_DB_TEST_ANON_KEY;
const secretKey = process.env.DEALATLAS_DB_TEST_SECRET_KEY;
const configured = Boolean(url && anonKey && secretKey);

const BUYER = "CANARY BUYER NEVER FREE";
const SOURCE_TITLE = "CANARY SOURCE TITLE NEVER FREE for specialised software implementation";
const SOURCE_URL = "https://canary-source.example/notice/987654";
const NOTICE_ID = "CANARY-NOTICE-987654";
const PREVIEW_TITLE = "Managed IT support for a public organisation";

type Json = Record<string, unknown> | Record<string, unknown>[] | null;

async function restRequest(
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Json }> {
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${url}${path}`, { ...init, headers });
  const text = await response.text();
  let body: Json = null;
  if (text) {
    body = JSON.parse(text) as Json;
  }
  return { status: response.status, body };
}

function mirrorFromRow(row: Record<string, unknown>): SubscriptionMirror {
  return {
    userId: String(row.user_id),
    isCurrent: row.is_current === true,
    status: row.status as SubscriptionMirror["status"],
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    currentPeriodStart:
      typeof row.current_period_start === "string" ? row.current_period_start : null,
    currentPeriodEnd:
      typeof row.current_period_end === "string" ? row.current_period_end : null,
    planKey: String(row.plan_key),
    billingInterval: (row.billing_interval ?? null) as SubscriptionMirror["billingInterval"],
    dodoProductId: typeof row.dodo_product_id === "string" ? row.dodo_product_id : null,
  };
}

describe.skipIf(!configured)("billing product allowlist against real users", () => {
  const suffix = randomUUID().slice(0, 8);
  const organizationId = randomUUID();
  const dealId = randomUUID();
  const slug = `billing-allowlist-${suffix}`;
  const password = "DealAtlas-billing-test-123";
  const monthlyId = `pdt_live_monthly_${suffix}`;
  const annualId = `pdt_live_annual_${suffix}`;
  const foundingId = `pdt_live_founding_${suffix}`;
  const legacyId = `pdt_live_legacy_${suffix}`;
  const testProductId = `pdt_testmode_${suffix}`;
  const allowed = getAllowedProductIds({
    DODO_PRO_MONTHLY_PRODUCT_ID: monthlyId,
    DODO_PRO_ANNUAL_PRODUCT_ID: annualId,
    DODO_FOUNDING_PRODUCT_ID: foundingId,
    DODO_PRO_ANNUAL_LEGACY_PRODUCT_IDS: ` ${legacyId} , , `,
  });
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const periodStart = new Date().toISOString();

  const accounts = {
    free: { email: `billing-free-${suffix}@example.com`, id: "", token: "" },
    pro: { email: `billing-pro-${suffix}@example.com`, id: "", token: "" },
    legacy: { email: `billing-legacy-${suffix}@example.com`, id: "", token: "" },
    unknown: { email: `billing-unknown-${suffix}@example.com`, id: "", token: "" },
  };
  let sourceId = "";

  async function createSignedInUser(email: string): Promise<{ id: string; token: string }> {
    const created = await restRequest(secretKey!, "/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (
      created.status >= 300 ||
      !created.body ||
      Array.isArray(created.body) ||
      typeof created.body.id !== "string"
    ) {
      throw new Error(`create user failed: ${JSON.stringify(created.body)}`);
    }
    const session = await restRequest(anonKey!, "/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (
      session.status >= 300 ||
      !session.body ||
      Array.isArray(session.body) ||
      typeof session.body.access_token !== "string"
    ) {
      throw new Error(`sign-in failed: ${JSON.stringify(session.body)}`);
    }
    return { id: created.body.id, token: session.body.access_token };
  }

  async function insertSubscription(input: {
    userId: string;
    productId: string;
    planKey: string;
    interval: "MONTHLY" | "ANNUAL";
    label: string;
  }) {
    const inserted = await restRequest(secretKey!, "/rest/v1/subscriptions", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: input.userId,
        dodo_customer_id: `cus_${suffix}_${input.label}`,
        dodo_subscription_id: `sub_${suffix}_${input.label}`,
        dodo_product_id: input.productId,
        plan_key: input.planKey,
        status: "ACTIVE",
        billing_interval: input.interval,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        is_current: true,
      }),
    });
    if (inserted.status >= 300) {
      throw new Error(`subscription insert failed: ${JSON.stringify(inserted.body)}`);
    }
  }

  async function loadMirror(userId: string): Promise<SubscriptionMirror | null> {
    const { status, body } = await restRequest(
      secretKey!,
      `/rest/v1/subscriptions?select=user_id,is_current,status,cancel_at_period_end,current_period_start,current_period_end,plan_key,billing_interval,dodo_product_id&user_id=eq.${userId}&is_current=eq.true`,
    );
    if (status !== 200 || !Array.isArray(body)) {
      throw new Error(`subscription read failed: ${status} ${JSON.stringify(body)}`);
    }
    const row = body[0];
    return row ? mirrorFromRow(row) : null;
  }

  async function previewFor(token: string) {
    return restRequest(anonKey!, "/rest/v1/rpc/get_preview_dto_by_slug", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ p_slug: slug }),
    });
  }

  function entitlementFor(mirror: SubscriptionMirror | null, productIds = allowed) {
    return resolveEntitlement(mirror, new Date(), productIds);
  }

  beforeAll(async () => {
    const source = await restRequest(
      secretKey!,
      "/rest/v1/data_sources?select=id&source_key=eq.find-a-tender",
    );
    if (source.status !== 200 || !Array.isArray(source.body) || !source.body[0]) {
      throw new Error(`find-a-tender source is not seeded (${source.status})`);
    }
    sourceId = String(source.body[0].id);

    const org = await restRequest(secretKey!, "/rest/v1/organizations", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: organizationId,
        canonical_name: BUYER,
        normalized_name: "canary buyer never free",
        domain: `canary-${suffix}.example`,
      }),
    });
    if (org.status >= 300) {
      throw new Error(`organization insert failed: ${JSON.stringify(org.body)}`);
    }

    const deal = await restRequest(secretKey!, "/rest/v1/deals", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: dealId,
        primary_source_id: sourceId,
        external_primary_id: `ext-${suffix}`,
        reference: "CANARY-REF-987654",
        source_title: SOURCE_TITLE,
        source_url: SOURCE_URL,
        buyer_organization_id: organizationId,
        deal_type: "PUBLIC_TENDER",
        buyer_sector: "PUBLIC",
        stage: "LIVE",
        status: "OPEN",
      }),
    });
    if (deal.status >= 300) {
      throw new Error(`deal insert failed: ${JSON.stringify(deal.body)}`);
    }

    const notice = await restRequest(secretKey!, "/rest/v1/notices", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        deal_id: dealId,
        source_id: sourceId,
        notice_identifier: NOTICE_ID,
        source_url: SOURCE_URL,
        is_current_version: true,
      }),
    });
    if (notice.status >= 300) {
      throw new Error(`notice insert failed: ${JSON.stringify(notice.body)}`);
    }

    const preview = await restRequest(secretKey!, "/rest/v1/deal_previews", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        deal_id: dealId,
        slug,
        preview_title: PREVIEW_TITLE,
        preview_summary:
          "A public organisation needs ongoing technology support from an experienced provider.",
        deal_type: "PUBLIC_TENDER",
        buyer_sector: "PUBLIC",
        stage: "LIVE",
        status: "OPEN",
        main_category: "technology",
        leakage_risk: "LOW",
        is_published: true,
      }),
    });
    if (preview.status >= 300) {
      throw new Error(`preview insert failed: ${JSON.stringify(preview.body)}`);
    }

    accounts.free = { ...accounts.free, ...(await createSignedInUser(accounts.free.email)) };
    accounts.pro = { ...accounts.pro, ...(await createSignedInUser(accounts.pro.email)) };
    accounts.legacy = { ...accounts.legacy, ...(await createSignedInUser(accounts.legacy.email)) };
    accounts.unknown = {
      ...accounts.unknown,
      ...(await createSignedInUser(accounts.unknown.email)),
    };

    await insertSubscription({
      userId: accounts.pro.id,
      productId: monthlyId,
      planKey: "PRO_MONTHLY",
      interval: "MONTHLY",
      label: "pro",
    });
    await insertSubscription({
      userId: accounts.legacy.id,
      productId: legacyId,
      planKey: "PRO_ANNUAL",
      interval: "ANNUAL",
      label: "legacy",
    });
    await insertSubscription({
      userId: accounts.unknown.id,
      productId: testProductId,
      planKey: "PRO_MONTHLY",
      interval: "MONTHLY",
      label: "unknown",
    });
  });

  afterAll(async () => {
    if (!configured) return;
    await restRequest(secretKey!, `/rest/v1/deals?id=eq.${dealId}`, { method: "DELETE" });
    await restRequest(secretKey!, `/rest/v1/organizations?id=eq.${organizationId}`, {
      method: "DELETE",
    });
    for (const account of Object.values(accounts)) {
      if (account.id) {
        await restRequest(secretKey!, `/auth/v1/admin/users/${account.id}`, {
          method: "DELETE",
        });
      }
    }
  });

  it("grants Pro only for allowlisted products and reveals source fields only then", async () => {
    const canonical = await restRequest(
      secretKey!,
      `/rest/v1/deals?select=source_title,source_url,reference&id=eq.${dealId}`,
    );
    const notice = await restRequest(
      secretKey!,
      `/rest/v1/notices?select=notice_identifier&deal_id=eq.${dealId}`,
    );
    const buyer = await restRequest(
      secretKey!,
      `/rest/v1/organizations?select=canonical_name&id=eq.${organizationId}`,
    );
    expect(canonical.status).toBe(200);
    const sourcePayload = {
      deal: canonical.body,
      notice: notice.body,
      buyer: buyer.body,
    };
    const sourceJson = JSON.stringify(sourcePayload);
    expect(sourceJson).toContain(BUYER);
    expect(sourceJson).toContain(SOURCE_TITLE);
    expect(sourceJson).toContain(SOURCE_URL);
    expect(sourceJson).toContain(NOTICE_ID);

    const cases = [
      { role: "free" as const, product: null, pro: false },
      { role: "pro" as const, product: monthlyId, pro: true },
      { role: "legacy" as const, product: legacyId, pro: true },
      { role: "unknown" as const, product: testProductId, pro: false },
    ];

    for (const item of cases) {
      const account = accounts[item.role];
      const mirror = await loadMirror(account.id);
      const entitlement = entitlementFor(mirror);
      expect(isProEntitlement(entitlement), item.role).toBe(item.pro);
      if (item.product) {
        expect(mirror?.dodoProductId, item.role).toBe(item.product);
        expect(mirror?.status, item.role).toBe("ACTIVE");
      } else {
        expect(mirror, item.role).toBeNull();
      }

      const preview = await previewFor(account.token);
      expect(preview.status, item.role).toBe(200);
      const previewJson = JSON.stringify(preview.body);
      expect(previewJson, item.role).toContain(PREVIEW_TITLE);
      expect(previewJson, item.role).not.toContain(BUYER);
      expect(previewJson, item.role).not.toContain(SOURCE_TITLE);
      expect(previewJson, item.role).not.toContain(SOURCE_URL);
      expect(previewJson, item.role).not.toContain(NOTICE_ID);
      expect(previewJson, item.role).not.toMatch(
        /"source_title"|"source_url"|"notice_identifier"|"canonical_name"|"buyer_name"/,
      );

      const deals = await restRequest(anonKey!, `/rest/v1/deals?select=source_title&id=eq.${dealId}`, {
        headers: { Authorization: `Bearer ${account.token}` },
      });
      expect(deals.status, item.role).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(deals.body), item.role).not.toContain(SOURCE_TITLE);

      const revealed = item.pro ? sourcePayload : preview.body;
      const revealedJson = JSON.stringify(revealed);
      if (item.pro) {
        expect(revealedJson, item.role).toContain(BUYER);
        expect(revealedJson, item.role).toContain(SOURCE_TITLE);
        expect(revealedJson, item.role).toContain(SOURCE_URL);
        expect(revealedJson, item.role).toContain(NOTICE_ID);
      } else {
        expect(revealedJson, item.role).not.toContain(BUYER);
        expect(revealedJson, item.role).not.toContain(SOURCE_TITLE);
        expect(revealedJson, item.role).not.toContain(SOURCE_URL);
        expect(revealedJson, item.role).not.toContain(NOTICE_ID);
      }
    }

    const proMirror = await loadMirror(accounts.pro.id);
    expect(entitlementFor(proMirror, getAllowedProductIds({})).plan).toBe("FREE");
    const proPreview = await previewFor(accounts.pro.token);
    expect(JSON.stringify(proPreview.body)).not.toContain(SOURCE_TITLE);
  });
});
