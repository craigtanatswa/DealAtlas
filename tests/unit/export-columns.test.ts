import { describe, expect, it } from "vitest";

import { toPaidDealDto, type PaidDealMappingInput } from "@/lib/deals/paid-dto";
import {
  DEAL_EXPORT_COLUMNS,
  EXPORT_INTERNAL_KEYS,
  assertDealExportRow,
  paidDealToExportRow,
} from "@/lib/exports/columns";

const mappingInput: PaidDealMappingInput = {
  deal: {
    id: "22222222-2222-4222-8222-222222222222",
    source_title: "CANARY SOURCE TITLE NEVER FREE",
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
    enquiry_deadline: null,
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
    api_url: "https://internal.example/secret",
    scraping_permitted: true,
  } as PaidDealMappingInput["source"],
  notices: [],
  documents: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      name: "Specification",
      document_type: "SPECIFICATION",
      source_url: "https://canary-source.example/spec.pdf",
      mime_type: "application/pdf",
      published_at: "2026-05-01T00:00:00.000Z",
      extracted_text: "verbatim file body",
    } as PaidDealMappingInput["documents"][number],
  ],
};

describe("CSV export columns", () => {
  it("maps exact paid fields and omits nested internals and secrets", () => {
    const dto = toPaidDealDto(mappingInput);
    const row = assertDealExportRow(paidDealToExportRow(dto));
    const json = JSON.stringify(row);

    expect(row.sourceTitle).toContain("CANARY SOURCE TITLE NEVER FREE");
    expect(row.buyerName).toBe("CANARY BUYER NEVER FREE");
    expect(row.reference).toBe("CANARY-REF-987654");
    expect(row.sourceUrl).toContain("canary-source.example");
    expect(Object.keys(row)).toEqual(DEAL_EXPORT_COLUMNS.map((column) => column.key));

    for (const key of EXPORT_INTERNAL_KEYS) {
      expect(key in row).toBe(false);
      expect(json).not.toContain(key);
    }
    expect(json).not.toContain("verbatim file body");
    expect(json).not.toContain("https://internal.example/secret");
    expect(json).not.toContain("intelligence");
    expect(json).not.toContain("protected_payload");
  });
});
