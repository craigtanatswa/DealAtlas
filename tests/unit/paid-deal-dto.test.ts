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
    reuse_status: "OPEN_LICENSE",
    licence_name: "Open Government Licence v3.0",
    licence_url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    terms_url: "https://www.find-tender.service.gov.uk/terms",
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
      redistribution_permitted: false,
    },
  ],
  lots: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      lot_number: "1",
      source_title: "Software implementation",
      source_description: "Lot verbatim description",
      status: "OPEN",
      currency: "GBP",
      value_min: 100000,
      value_max: 200000,
      exact_location_text: "Southwark, London",
      submission_deadline: "2026-07-01T12:00:00.000Z",
      contract_start_date: null,
      contract_end_date: null,
      sme_suitable: true,
      vcse_suitable: null,
    },
  ],
  requirements: [
    {
      id: "77777777-7777-4777-8777-777777777777",
      lot_id: null,
      requirement_type: "SECURITY",
      name: "Cyber Essentials",
      description: "Valid certification required",
      mandatory: true,
      minimum_value: null,
      unit: null,
      evidence_required: "Certificate",
      is_inferred: false,
    },
  ],
  awardCriteria: [
    {
      id: "88888888-8888-4888-8888-888888888888",
      lot_id: null,
      criterion_name: "Quality",
      criterion_description: "Method statement",
      criterion_type: "quality",
      weight_percent: 60,
      order_of_importance: 1,
    },
  ],
  changes: [
    {
      id: "99999999-9999-4999-8999-999999999999",
      change_type: "DEADLINE_EXTENDED",
      field_name: "submission_deadline",
      occurred_at: "2026-05-10T00:00:00.000Z",
      material: true,
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
    expect(dto.procurementContact?.email).toBe(
      "procurement@canary-protected.example",
    );
    expect(dto.sourceUrl).toBe("https://canary-source.example/notice");
    expect(dto.applicationUrl).toBe("https://canary-source.example/apply");
    expect(dto.lots).toHaveLength(1);
    expect(dto.requirements[0]?.name).toBe("Cyber Essentials");
    expect(dto.awardCriteria[0]?.weightPercent).toBe(60);
    expect(dto.documents[0]?.access).toBe("link");
    expect(dto.documents[0]?.sourceUrl).toContain("spec.pdf");
    expect(dto.timeline.some((event) => event.kind === "deadline")).toBe(true);
    expect(dto.intelligence).toBeNull();
    expect(dto.provenance.contentAccess).toBe("redistribute");
    expect(json).toContain("CANARY-REF-987654");
    expect(SEEDED_PROTECTED_MARKERS.some((marker) => json.includes(marker))).toBe(
      true,
    );
    expect(json).not.toContain("extracted_text");
    expect(assertPaidDealDto(dto)).toBe(dto);
  });

  it("withholds verbatim description when the source is link-only", () => {
    const dto = toPaidDealDto({
      ...mappingInput,
      source: {
        ...mappingInput.source!,
        reuse_status: "TERMS_REVIEWED",
      },
    });

    expect(dto.provenance.contentAccess).toBe("link");
    expect(dto.sourceTitle).toContain("CANARY SOURCE TITLE NEVER FREE");
    expect(dto.sourceDescription).toBeNull();
    expect(dto.lots[0]?.sourceDescription).toBeNull();
    expect(dto.sourceUrl).toBe("https://canary-source.example/notice");
    expect(dto.documents[0]?.access).toBe("link");
  });

  it("withholds notice content when redistribution is prohibited", () => {
    const dto = toPaidDealDto({
      ...mappingInput,
      source: {
        ...mappingInput.source!,
        reuse_status: "PROHIBITED",
      },
    });
    const json = JSON.stringify(dto);

    expect(dto.provenance.contentAccess).toBe("withhold");
    expect(dto.sourceTitle).toBe("Source content withheld");
    expect(dto.sourceDescription).toBeNull();
    expect(dto.buyer).toBeNull();
    expect(dto.procurementContact).toBeNull();
    expect(dto.sourceUrl).toBeNull();
    expect(dto.lots).toEqual([]);
    expect(dto.requirements).toEqual([]);
    expect(dto.documents).toEqual([]);
    expect(json).not.toContain("CANARY SOURCE TITLE NEVER FREE");
    expect(json).not.toContain("CANARY-OCID-LOOKUP");
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
      documents: [
        {
          ...mappingInput.documents[0]!,
          extracted_text: "verbatim file body that must never ship",
        },
      ],
      changes: [
        {
          ...mappingInput.changes![0]!,
          previous_value: { secret: "old" },
          new_value: { secret: "new" },
        } as NonNullable<PaidDealMappingInput["changes"]>[number] & {
          previous_value: unknown;
          new_value: unknown;
        },
      ],
    };

    const dto = toPaidDealDto(poisoned);
    const json = JSON.stringify(dto);

    expect(assertPaidDealDto(dto)).toBe(dto);
    expect(json).not.toContain("data_quality_score");
    expect(json).not.toContain("scraping_permitted");
    expect(json).not.toContain("https://internal.example/secret");
    expect(json).not.toContain("consecutive_failures");
    expect(json).not.toContain("extracted_text");
    expect(json).not.toContain("verbatim file body");
    expect(json).not.toContain("previous_value");
    expect("data_quality_score" in dto).toBe(false);
    expect("reuse_status" in dto).toBe(false);
    expect(dto.provenance.reuseStatus).toBe("OPEN_LICENSE");
    expect(dto.source).toEqual({
      id: mappingInput.source?.id,
      name: "Find a Tender",
      sourceKey: "find-a-tender",
      sourceType: "PUBLIC_PORTAL",
      baseUrl: "https://www.find-tender.service.gov.uk/",
    });
  });

  it("drops unsafe source URLs", () => {
    const dto = toPaidDealDto({
      ...mappingInput,
      deal: {
        ...mappingInput.deal,
        source_url: "javascript:alert(1)",
        application_url: "https://canary-source.example/apply",
      },
    });

    expect(dto.sourceUrl).toBeNull();
    expect(dto.applicationUrl).toBe("https://canary-source.example/apply");
  });

  it("keeps inferred intelligence visibly separate from source facts", () => {
    const dto = toPaidDealDto({
      ...mappingInput,
      intelligence: {
        summary: "DealAtlas inferred summary",
        buyerNeed: "Need for software",
        idealSupplier: "Software SME",
        keyDeliverables: ["Build"],
        mandatoryRequirements: ["Cyber Essentials"],
        competitionNotes: "Open",
        smeAccessibility: "HIGH",
        bidComplexity: "MEDIUM",
        competitionLevel: "LOW",
        deadlineUrgency: "MEDIUM",
        riskFlags: [{ code: "TIGHT_DEADLINE", label: "Short remaining response window" }],
        estimatedRenewalDate: null,
        confidence: 0.71,
        generationMethod: "RULES",
        modelVersion: "dealatlas-rules/1.0.0",
        fieldProvenance: {
          summary: {
            method: "RULES",
            model: "dealatlas-rules",
            version: "1.0.0",
            confidence: 0.71,
            evidence: [{ source: "canonical", field: "source_title" }],
            generatedAt: "2026-05-02T00:00:00.000Z",
          },
        },
        generatedAt: "2026-05-02T00:00:00.000Z",
      },
    });

    expect(dto.intelligence?.label).toBe("DealAtlas analysis");
    expect(dto.intelligence?.summary.kind).toBe("inference");
    expect(dto.intelligence?.summary.value).toBe("DealAtlas inferred summary");
    expect(dto.intelligence?.summary.evidence[0]?.field).toBe("source_title");
    expect(dto.sourceTitle).toContain("CANARY SOURCE TITLE NEVER FREE");
  });
});
