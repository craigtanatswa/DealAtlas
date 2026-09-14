import { describe, expect, it } from "vitest";

import {
  assertPaidDealDto,
  PAID_DEAL_DTO_KEYS,
  toPaidDealDto,
  type PaidDealMappingInput,
} from "@/lib/deals/paid-dto";
import { SEEDED_PROTECTED_MARKERS } from "../helpers/protected-leak";

const mappingInput: PaidDealMappingInput = {
  deal: {
    id: "22222222-2222-4222-8222-222222222222",
    source_title: "CANARY SOURCE TITLE NEVER FREE for specialised software",
    source_description: "CANARY-OCID-LOOKUP exact notice text",
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
  },
  notices: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      notice_identifier: "CANARY-NOTICE-1",
      notice_type: "tender",
      notice_stage: "LIVE",
      source_url: "https://canary-source.example/notice",
      published_at: "2026-05-01T00:00:00.000Z",
      modified_at: null,
      is_current_version: true,
    },
  ],
  documents: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      name: "Specification",
      document_type: "SPECIFICATION",
      source_url: "https://canary-source.example/spec.pdf",
      mime_type: "application/pdf",
      published_at: "2026-05-01T00:00:00.000Z",
    },
  ],
};

describe("paid deal DTO", () => {
  it("maps explicit paid fields including protected source identity", () => {
    const dto = toPaidDealDto(mappingInput);
    const json = JSON.stringify(dto);

    expect(Object.keys(dto).sort()).toEqual([...PAID_DEAL_DTO_KEYS].sort());
    expect(dto.sourceTitle).toContain("CANARY SOURCE TITLE NEVER FREE");
    expect(dto.buyer?.name).toBe("CANARY BUYER NEVER FREE");
    expect(dto.sourceUrl).toBe("https://canary-source.example/notice");
    expect(json).toContain("CANARY-REF-987654");
    expect(SEEDED_PROTECTED_MARKERS.some((marker) => json.includes(marker))).toBe(
      true,
    );
    expect(assertPaidDealDto(dto)).toBe(dto);
  });

  it("does not copy internal or secret fields from a poisoned canonical row", () => {
    const poisoned = {
      ...mappingInput,
      deal: {
        ...mappingInput.deal,
        data_quality_score: 12,
        source_count: 9,
        created_at: "2026-01-01T00:00:00.000Z",
      } as PaidDealMappingInput["deal"] & {
        data_quality_score: number;
        source_count: number;
        created_at: string;
      },
      source: {
        ...mappingInput.source!,
        scraping_permitted: true,
        reuse_status: "OPEN_LICENSE",
        api_url: "https://internal.example/secret",
        consecutive_failures: 4,
      } as PaidDealMappingInput["source"] & {
        scraping_permitted: boolean;
        reuse_status: string;
        api_url: string;
        consecutive_failures: number;
      },
    };

    const dto = toPaidDealDto(poisoned);
    const json = JSON.stringify(dto);

    expect(assertPaidDealDto(dto)).toBe(dto);
    expect(json).not.toContain("data_quality_score");
    expect(json).not.toContain("scraping_permitted");
    expect(json).not.toContain("https://internal.example/secret");
    expect(json).not.toContain("consecutive_failures");
    expect(json).not.toContain("OPEN_LICENSE");
    expect("data_quality_score" in dto).toBe(false);
    expect(dto.source).toEqual({
      id: mappingInput.source?.id,
      name: "Find a Tender",
      sourceKey: "find-a-tender",
      sourceType: "PUBLIC_PORTAL",
      baseUrl: "https://www.find-tender.service.gov.uk",
    });
  });
});
