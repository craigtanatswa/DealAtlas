import { describe, expect, it, vi } from "vitest";

import { PLANS } from "@/lib/constants";
import { toPaidDealDto, type PaidDealDto, type PaidDealMappingInput } from "@/lib/deals/paid-dto";
import {
  ENTITLEMENT_FIXTURE_NOW,
  ENTITLEMENT_FIXTURE_USER_ID,
  entitlementSubscriptionFixtures,
  resolveEntitlement,
} from "@/lib/entitlements";
import {
  EXPORT_ERROR,
  ExportQuotaError,
  fulfillDealExportRequest,
} from "@/lib/exports/access";
import { CSV_UTF8_BOM } from "@/lib/exports/csv";
import { CSV_FORMULA_INJECTION_FIXTURES } from "../helpers/csv-injection";

const DEAL_ID = "22222222-2222-4222-8222-222222222222";

const mappingInput: PaidDealMappingInput = {
  deal: {
    id: DEAL_ID,
    source_title: "CANARY SOURCE TITLE NEVER FREE for specialised software",
    source_description: "Official notice summary for entitled subscribers.",
    reference: "CANARY-REF-987654",
    ocid: "ocds-canary-123456",
    external_primary_id: "ext-canary",
    deal_type: "PUBLIC_TENDER",
    buyer_sector: "PUBLIC",
    stage: "LIVE",
    status: "OPEN",
    main_category: "Technology",
    procurement_method: "open",
    special_regime: null,
    currency: "GBP",
    value_min_ex_vat: 250000,
    value_max_ex_vat: 500000,
    exact_value_text: "£375,000",
    exact_location_text: "Southwark, London",
    enquiry_deadline: "2026-06-20T12:00:00.000Z",
    submission_deadline: "2026-07-01T12:00:00.000Z",
    award_decision_date: null,
    contract_start_date: null,
    contract_end_date: null,
    extension_end_date: null,
    next_procurement_date: null,
    estimated_renewal_date: null,
    sme_suitable: true,
    vcse_suitable: null,
    source_url: "https://canary-source.example/notice",
    application_url: "https://canary-source.example/apply",
    first_published_at: "2026-05-01T00:00:00.000Z",
    latest_source_at: "2026-05-02T00:00:00.000Z",
  },
  buyer: {
    id: "11111111-1111-4111-8111-111111111111",
    canonical_name: "CANARY BUYER NEVER FREE",
    website: "https://canary-protected.example",
    domain: "canary-protected.example",
    email: "procurement@canary-protected.example",
    phone: "+441111111111",
    city: "London",
    region: "England",
    country_code: "GB",
  },
  source: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Find a Tender",
    source_key: "find-a-tender",
    source_type: "PUBLIC_PORTAL",
    base_url: "https://www.find-tender.service.gov.uk",
    reuse_status: "OPEN_LICENSE",
    licence_name: "Open Government Licence v3.0",
    licence_url:
      "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    terms_url: null,
  },
  notices: [],
  documents: [],
};

const paidDto = toPaidDealDto(mappingInput);

function formulaDeal(title: string): PaidDealDto {
  return toPaidDealDto({
    ...mappingInput,
    deal: { ...mappingInput.deal, source_title: title },
  });
}

describe("protected CSV export access", () => {
  const now = ENTITLEMENT_FIXTURE_NOW;
  const body = { dealIds: [DEAL_ID] };

  it("rejects anonymous callers before resolving deals or recording usage", async () => {
    const resolveDealIds = vi.fn();
    const loadPaidDeals = vi.fn();
    const recordUsage = vi.fn();
    const result = await fulfillDealExportRequest({
      userId: null,
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.activePro(),
        now,
      ),
      remaining: 1000,
      clientClaimedPlan: PLANS.PRO,
      body,
      resolveDealIds,
      loadPaidDeals,
      recordUsage,
    });

    expect(result).toEqual({
      status: 401,
      body: { error: EXPORT_ERROR.UNAUTHENTICATED, code: "UNAUTHENTICATED" },
    });
    expect(resolveDealIds).not.toHaveBeenCalled();
    expect(loadPaidDeals).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("rejects authenticated FREE users before loading paid fields", async () => {
    const resolveDealIds = vi.fn();
    const loadPaidDeals = vi.fn();
    const recordUsage = vi.fn();
    const result = await fulfillDealExportRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      entitlement: resolveEntitlement(null, now),
      remaining: 1000,
      clientClaimedPlan: PLANS.PRO,
      body,
      resolveDealIds,
      loadPaidDeals,
      recordUsage,
    });

    expect(result.status).toBe(403);
    expect(result).toMatchObject({
      body: { error: EXPORT_ERROR.FORBIDDEN, code: "FORBIDDEN" },
    });
    expect(resolveDealIds).not.toHaveBeenCalled();
    expect(loadPaidDeals).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("rejects an over-limit request before resolving IDs or generating CSV", async () => {
    const resolveDealIds = vi.fn();
    const loadPaidDeals = vi.fn();
    const recordUsage = vi.fn();
    const result = await fulfillDealExportRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.activePro(),
        now,
      ),
      remaining: 0,
      body,
      resolveDealIds,
      loadPaidDeals,
      recordUsage,
    });

    expect(result.status).toBe(403);
    expect(result).toMatchObject({
      body: { code: "EXPORT_LIMIT" },
    });
    expect(resolveDealIds).not.toHaveBeenCalled();
    expect(loadPaidDeals).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("rejects a selected set larger than remaining quota before loading paid fields", async () => {
    const resolveDealIds = vi.fn();
    const loadPaidDeals = vi.fn();
    const recordUsage = vi.fn();
    const extraId = "55555555-5555-4555-8555-555555555555";
    const result = await fulfillDealExportRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.activePro(),
        now,
      ),
      remaining: 1,
      body: { dealIds: [DEAL_ID, extraId] },
      resolveDealIds,
      loadPaidDeals,
      recordUsage,
    });

    expect(result.status).toBe(403);
    expect(result).toMatchObject({
      body: { code: "EXPORT_LIMIT" },
    });
    expect(resolveDealIds).not.toHaveBeenCalled();
    expect(loadPaidDeals).not.toHaveBeenCalled();
  });

  it("exports exact paid fields for an active Pro user and records usage", async () => {
    const resolveDealIds = vi.fn().mockResolvedValue([DEAL_ID]);
    const loadPaidDeals = vi.fn().mockResolvedValue([paidDto]);
    const recordUsage = vi.fn().mockResolvedValue(undefined);
    const result = await fulfillDealExportRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.activePro(),
        now,
      ),
      remaining: 1000,
      clientClaimedPlan: PLANS.FREE,
      body,
      resolveDealIds,
      loadPaidDeals,
      recordUsage,
      now: new Date("2026-09-15T17:00:00.000Z"),
    });

    expect(result.status).toBe(200);
    if (result.status !== 200) {
      throw new Error("expected CSV export");
    }
    expect(result.filename).toBe("dealatlas-deals-2026-09-15.csv");
    expect(result.rowCount).toBe(1);
    expect(result.csv.startsWith(CSV_UTF8_BOM)).toBe(true);
    expect(result.csv).toContain("CANARY SOURCE TITLE NEVER FREE");
    expect(result.csv).toContain("CANARY BUYER NEVER FREE");
    expect(result.csv).toContain("CANARY-REF-987654");
    expect(result.csv).not.toContain("data_quality_score");
    expect(result.csv).not.toContain("protected_payload");
    expect(result.csv).not.toContain("dodo_customer_id");
    expect(recordUsage).toHaveBeenCalledWith({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      rowCount: 1,
    });
    expect(loadPaidDeals).toHaveBeenCalledWith([DEAL_ID], {
      kind: "pro",
      userId: ENTITLEMENT_FIXTURE_USER_ID,
    });
  });

  it("enforces the monthly quota across repeated Pro requests", async () => {
    const usage = { used: 0 };
    const recordUsage = vi.fn(async ({ rowCount }: { rowCount: number }) => {
      if (usage.used + rowCount > 1000) {
        throw new ExportQuotaError();
      }
      usage.used += rowCount;
    });

    const firstIds = Array.from({ length: 600 }, (_, index) => {
      return `22222222-2222-4222-8222-${index.toString(16).padStart(12, "0")}`;
    });
    const firstDeals = firstIds.map((id) =>
      toPaidDealDto({ ...mappingInput, deal: { ...mappingInput.deal, id } }),
    );

    const first = await fulfillDealExportRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.activePro(),
        now,
      ),
      remaining: 1000 - usage.used,
      body: { dealIds: firstIds },
      resolveDealIds: async () => firstIds,
      loadPaidDeals: async () => firstDeals,
      recordUsage,
    });
    expect(first.status).toBe(200);
    expect(usage.used).toBe(600);

    const secondIds = firstIds;
    const second = await fulfillDealExportRequest({
      userId: ENTITLEMENT_FIXTURE_USER_ID,
      entitlement: resolveEntitlement(
        entitlementSubscriptionFixtures.activePro(),
        now,
      ),
      remaining: 1000 - usage.used,
      body: { dealIds: secondIds },
      resolveDealIds: async () => secondIds,
      loadPaidDeals: async () => firstDeals,
      recordUsage,
    });

    expect(second.status).toBe(403);
    expect(second).toMatchObject({ body: { code: "EXPORT_LIMIT" } });
    expect(usage.used).toBe(600);
  });

  it("escapes formula-injection titles in a successful Pro export", async () => {
    for (const fixture of CSV_FORMULA_INJECTION_FIXTURES) {
      const deal = formulaDeal(fixture.raw);
      const result = await fulfillDealExportRequest({
        userId: ENTITLEMENT_FIXTURE_USER_ID,
        entitlement: resolveEntitlement(
          entitlementSubscriptionFixtures.activePro(),
          now,
        ),
        remaining: 1000,
        body,
        resolveDealIds: async () => [DEAL_ID],
        loadPaidDeals: async () => [deal],
        recordUsage: async () => undefined,
      });
      expect(result.status).toBe(200);
      if (result.status !== 200) {
        throw new Error("expected CSV export");
      }
      expect(result.csv).toContain(`'${fixture.raw.replaceAll('"', '""')}`);
      expect(result.csv).not.toMatch(new RegExp(`(?:^|,)${fixture.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
  });
});
