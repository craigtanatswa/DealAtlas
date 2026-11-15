import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PublicSupabaseClient } from "@/lib/db/previews";
import { PUBLIC_PREVIEW_DTO_KEYS, toDealCardData } from "@/lib/search/dto";
import { BUYER_SECTOR_OPTIONS } from "@/lib/search/filters";
import { parsePublicSearchParams } from "@/lib/search/params";
import { searchPublicDealPreviews } from "@/lib/search/public";

const CARD_KEYS = [
  "slug",
  "previewTitle",
  "previewSummary",
  "buyerSector",
  "mainCategory",
  "broadRegion",
  "valueBand",
  "deadlineBand",
  "smeSuitability",
  "bidComplexity",
  "status",
  "dealType",
  "relevanceTags",
  "freshnessLabel",
  "goodsServices",
  "quantities",
  "standards",
  "keyDates",
  "specificSector",
  "currency",
] as const;

describe("public buyer sector filter", () => {
  it("offers only Public and Private in the public filter dropdown", () => {
    expect(BUYER_SECTOR_OPTIONS).toEqual([
      { value: "PUBLIC", label: "Public" },
      { value: "PRIVATE", label: "Private" },
    ]);
  });

  it("still parses legacy buyer sector URL values", () => {
    expect(
      parsePublicSearchParams({ buyerSector: "NONPROFIT" }).buyerSector,
    ).toBe("NONPROFIT");
    expect(
      parsePublicSearchParams({ buyerSector: "EDUCATION" }).buyerSector,
    ).toBe("EDUCATION");
  });

  it("returns only allow-listed public keys even when RPC rows carry canaries", async () => {
    const canaryRow = {
      slug: "buyer-filter-public-preview",
      preview_title: "Specialist support for a public organisation",
      preview_summary: "A public organisation needs specialist support.",
      deal_type: "PUBLIC_TENDER",
      buyer_sector: "EDUCATION",
      buyer_type: "PUBLIC",
      sector: "EDUCATION",
      stage: "LIVE",
      status: "OPEN",
      main_category: "Technology",
      broad_region: "Nationwide",
      value_band: null,
      deadline_band: null,
      duration_band: null,
      sme_suitability: null,
      bid_complexity: null,
      competition_level: null,
      requirements_preview: [],
      relevance_tags: [],
      freshness_label: null,
      total_count: 1,
      buyer_name: "CANARY BUYER NEVER FREE",
      buyerName: "CANARY BUYER NEVER FREE",
      buyer_organization_id: "canary-organisation-id",
      source_key: "canary-source-key",
      sourceKey: "canary-source-key",
      source_url: "https://canary-source.example/notice",
      reference: "CANARY-REF-987654",
      ocid: "ocds-canary-123456",
      notice_identifier: "CANARY-NOTICE-987654",
      noticeIdentifier: "CANARY-NOTICE-987654",
      submission_deadline: "2026-12-24T12:00:00.000Z",
    };
    const rpc = vi.fn().mockResolvedValue({ data: [canaryRow], error: null });
    const client = { rpc } as unknown as PublicSupabaseClient;

    const result = await searchPublicDealPreviews(client, {
      buyerSector: "PUBLIC",
      page: 1,
      limit: 20,
    });

    expect(rpc).toHaveBeenCalledWith(
      "search_preview_dtos",
      expect.objectContaining({ p_buyer_sector: "PUBLIC" }),
    );
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    const dto = result.items[0]!;
    const card = toDealCardData(dto);

    expect(Object.keys(dto).sort()).toEqual([...PUBLIC_PREVIEW_DTO_KEYS].sort());
    expect(Object.keys(card).sort()).toEqual([...CARD_KEYS].sort());

    const blob = JSON.stringify({ dto, card });
    for (const marker of [
      "CANARY BUYER NEVER FREE",
      "canary-organisation-id",
      "canary-source-key",
      "https://canary-source.example/notice",
      "CANARY-REF-987654",
      "ocds-canary-123456",
      "CANARY-NOTICE-987654",
      "2026-12-24T12:00:00.000Z",
    ]) {
      expect(blob).not.toContain(marker);
    }
  });
});
