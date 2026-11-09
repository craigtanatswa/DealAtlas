import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getServerEnv = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env/server", () => ({
  getServerEnv,
}));

import { getAllowedProductIds } from "@/lib/billing/allowed-products";
import { fulfillProtectedDealRequest } from "@/lib/deals/protected-access";
import type { PaidDealDto } from "@/lib/deals/paid-dto";
import { PLANS } from "@/lib/constants";
import {
  ENTITLEMENT_FIXTURE_NOW,
  ENTITLEMENT_FIXTURE_USER_ID,
  createSubscriptionFixture,
  isProEntitlement,
  resolveEntitlement,
} from "@/lib/entitlements";
import { toPublicDealPreview } from "@/lib/search/dto";

const ROOT = path.resolve(__dirname, "../..");
const DEAL_ID = "22222222-2222-4222-8222-222222222222";
const BUYER = "CANARY BUYER NEVER FREE";
const SOURCE_TITLE = "CANARY SOURCE TITLE NEVER FREE";
const SOURCE_URL = "https://canary-source.example/notice/987654";
const NOTICE_ID = "CANARY-NOTICE-987654";

const LIVE_ENV = {
  DODO_PRO_MONTHLY_PRODUCT_ID: " pdt_live_monthly ",
  DODO_PRO_ANNUAL_PRODUCT_ID: "pdt_live_annual",
  DODO_FOUNDING_PRODUCT_ID: "pdt_live_founding",
  DODO_PRO_ANNUAL_LEGACY_PRODUCT_IDS: " pdt_live_legacy , , pdt_live_legacy_2 ",
};

function allowlist() {
  return getAllowedProductIds(LIVE_ENV);
}

function active(productId: string | null | undefined, allowed = allowlist()) {
  return resolveEntitlement(
    createSubscriptionFixture({
      status: "ACTIVE",
      isCurrent: true,
      dodoProductId: productId,
      currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    }),
    ENTITLEMENT_FIXTURE_NOW,
    allowed,
  );
}

const paid = {
  id: DEAL_ID,
  sourceTitle: SOURCE_TITLE,
  sourceUrl: SOURCE_URL,
  buyer: { name: BUYER },
  notices: [{ id: "n1", noticeIdentifier: NOTICE_ID, sourceUrl: SOURCE_URL }],
} as PaidDealDto;

const preview = toPublicDealPreview({
  slug: "managed-it-support",
  preview_title: "Managed IT support for a public organisation",
  preview_summary: "A public organisation needs ongoing technology support.",
  deal_type: "PUBLIC_TENDER",
  buyer_sector: "PUBLIC",
  stage: "LIVE",
  status: "OPEN",
  main_category: "technology",
  broad_region: null,
  value_band: null,
  deadline_band: null,
  duration_band: null,
  sme_suitability: null,
  bid_complexity: null,
  competition_level: null,
  requirements_preview: [],
  relevance_tags: [],
  freshness_label: null,
});

function visibleDeal(productId: string | null, allowed = allowlist()) {
  const entitlement = active(productId, allowed);
  return isProEntitlement(entitlement) ? paid : preview;
}

describe("deployment product allowlist", () => {
  beforeEach(() => {
    getServerEnv.mockReset();
  });

  it("reads only the configured product ids, trimmed, with empties dropped", () => {
    expect([...allowlist()].sort()).toEqual(
      [
        "pdt_live_annual",
        "pdt_live_founding",
        "pdt_live_legacy",
        "pdt_live_legacy_2",
        "pdt_live_monthly",
      ].sort(),
    );
    expect(getServerEnv).not.toHaveBeenCalled();
    const source = fs.readFileSync(
      path.join(ROOT, "lib/billing/allowed-products.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/pdt_/);
  });

  it("keeps the leak Pro seed on the leak app's monthly product id", () => {
    const sql = fs.readFileSync(path.join(ROOT, "tests/leak/seed/world.sql"), "utf8");
    const start = fs.readFileSync(path.join(ROOT, "tests/leak/start-app.sh"), "utf8");
    const monthly = start.match(/DODO_PRO_MONTHLY_PRODUCT_ID="([^"]+)"/)?.[1];
    expect(monthly).toBeTruthy();
    expect(sql).toContain(`sub_leak_pro', '${monthly}'`);
  });

  it("fails closed when server env cannot be read", () => {
    getServerEnv.mockImplementation(() => {
      throw new Error("server env unavailable");
    });
    expect(getAllowedProductIds().size).toBe(0);
    expect(active("pdt_live_monthly", getAllowedProductIds()).plan).toBe(PLANS.FREE);
  });

  it("grants Pro for allowed, legacy, and founding products only", () => {
    expect(active("pdt_live_monthly").plan).toBe(PLANS.PRO);
    expect(active("pdt_live_annual").plan).toBe(PLANS.PRO);
    expect(active("pdt_live_founding").plan).toBe(PLANS.PRO);
    expect(active("pdt_live_legacy").plan).toBe(PLANS.PRO);
    expect(active("pdt_live_legacy_2").plan).toBe(PLANS.PRO);
    expect(active(" pdt_live_monthly ").plan).toBe(PLANS.PRO);
    expect(active("pdt_test_mode_monthly").plan).toBe(PLANS.FREE);
    expect(active("pdt_unknown_other").plan).toBe(PLANS.FREE);
    expect(active(null).plan).toBe(PLANS.FREE);
    expect(active("").plan).toBe(PLANS.FREE);
    expect(active("  ").plan).toBe(PLANS.FREE);
  });

  it("grants Pro to nobody when the allowlist is empty", () => {
    const empty = getAllowedProductIds({});
    expect(empty.size).toBe(0);
    expect(active("pdt_live_monthly", empty).plan).toBe(PLANS.FREE);
    expect(
      resolveEntitlement(
        createSubscriptionFixture({ status: "ACTIVE" }),
        ENTITLEMENT_FIXTURE_NOW,
        empty,
      ).plan,
    ).toBe(PLANS.FREE);
  });

  it("shows source fields only for an allowlisted Pro subscription", async () => {
    const loadPaidDeal = async () => paid;
    const pro = visibleDeal("pdt_live_monthly");
    const free = visibleDeal(null);
    const unknown = visibleDeal("pdt_test_mode_monthly");
    const legacy = visibleDeal("pdt_live_legacy");

    expect(pro).toMatchObject({
      sourceTitle: SOURCE_TITLE,
      sourceUrl: SOURCE_URL,
      buyer: { name: BUYER },
      notices: [{ noticeIdentifier: NOTICE_ID }],
    });
    expect(legacy).toBe(paid);

    for (const dto of [free, unknown]) {
      const json = JSON.stringify(dto);
      expect(json).not.toContain(BUYER);
      expect(json).not.toContain(SOURCE_TITLE);
      expect(json).not.toContain(SOURCE_URL);
      expect(json).not.toContain(NOTICE_ID);
      expect(dto).not.toHaveProperty("sourceTitle");
      expect(dto).not.toHaveProperty("sourceUrl");
      expect(dto).not.toHaveProperty("buyer");
      expect(dto).not.toHaveProperty("notices");
      expect(dto).not.toHaveProperty("noticeIdentifier");
    }

    const proResponse = await fulfillProtectedDealRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      dealId: DEAL_ID,
      entitlement: active("pdt_live_monthly"),
      loadPaidDeal,
    });
    expect(proResponse).toEqual({ status: 200, body: paid });

    for (const productId of [null, "pdt_test_mode_monthly"]) {
      const response = await fulfillProtectedDealRequest({
        userId: ENTITLEMENT_FIXTURE_USER_ID,
        dealId: DEAL_ID,
        entitlement: active(productId),
        loadPaidDeal,
      });
      expect(response.status).toBe(403);
      expect(JSON.stringify(response)).not.toContain(SOURCE_TITLE);
    }
  });
});
