// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DealPaidDetail } from "@/components/deals/deal-paid-detail";
import { ExternalSourceLink } from "@/components/deals/external-source-link";
import { toPaidDealDto, type PaidDealMappingInput } from "@/lib/deals/paid-dto";
import { findProtectedMarkerLeaks } from "../helpers/protected-leak";

const mappingInput: PaidDealMappingInput = {
  deal: {
    id: "22222222-2222-4222-8222-222222222222",
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
    source_type: "GOVERNMENT_OPEN_DATA",
    base_url: "https://www.find-tender.service.gov.uk",
    reuse_status: "OPEN_LICENSE",
    licence_name: "Open Government Licence v3.0",
    licence_url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    terms_url: null,
  },
  notices: [],
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
  lots: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      lot_number: "1",
      source_title: "Implementation",
      source_description: "Lot description",
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
    intelligence: {
      summary: "Inferred buyer need for specialised software.",
      buyerNeed: "Software implementation capability.",
      idealSupplier: "An experienced software supplier.",
      keyDeliverables: ["Implementation"],
      mandatoryRequirements: ["Cyber Essentials"],
      competitionNotes: "Open procedure.",
      smeAccessibility: "HIGH",
      bidComplexity: "MEDIUM",
      competitionLevel: "LOW",
      deadlineUrgency: "MEDIUM",
      riskFlags: [{ code: "TIGHT_DEADLINE", label: "Short remaining response window" }],
      estimatedRenewalDate: null,
      confidence: 0.7,
      generationMethod: "RULES",
      modelVersion: "dealatlas-rules/1.0.0",
      fieldProvenance: {
        summary: {
          method: "RULES",
          model: "dealatlas-rules",
          version: "1.0.0",
          confidence: 0.7,
          evidence: [{ source: "canonical", field: "source_title" }],
          generatedAt: "2026-05-02T00:00:00.000Z",
        },
      },
      generatedAt: "2026-05-02T00:00:00.000Z",
    },
  };

describe("paid deal detail", () => {
  it("renders entitled source identity, lots, criteria, documents, and provenance", () => {
    const dto = toPaidDealDto(mappingInput);
    const { container } = render(<DealPaidDetail deal={dto} />);
    const html = container.innerHTML;

    expect(screen.getByRole("heading", { name: dto.sourceTitle })).toBeTruthy();
    expect(html).toContain("CANARY BUYER NEVER FREE");
    expect(screen.getByRole("link", { name: "CANARY BUYER NEVER FREE" }).getAttribute("href")).toBe(
      "/app/buyers/11111111-1111-4111-8111-111111111111",
    );
    expect(html).toContain("CANARY-REF-987654");
    expect(html).toContain("Cyber Essentials");
    expect(html).toContain("Quality");
    expect(html).toContain("Source provenance");
    expect(html).toContain("DealAtlas analysis");
    expect(html).toContain("Inferred");
    expect(html).not.toMatch(/blur/);
    expect(findProtectedMarkerLeaks(html).length).toBeGreaterThan(0);

    const sourceLink = screen.getByRole("link", { name: /Open source notice/i });
    expect(sourceLink.getAttribute("href")).toBe(
      "https://canary-source.example/notice",
    );
    expect(sourceLink.getAttribute("target")).toBe("_blank");
    expect(sourceLink.getAttribute("rel")).toContain("noopener");
    expect(sourceLink.getAttribute("rel")).toContain("noreferrer");
  });

  it("renders sanitised match reasons without extra source copying", () => {
    cleanup();
    const dto = toPaidDealDto(mappingInput);
    const { container } = render(
      <DealPaidDetail
        deal={dto}
        match={{
          score: 81,
          reasons: [
            {
              code: "CATEGORY_OVERLAP",
              kind: "match",
              label: "Category overlap with your profile",
            },
          ],
          mismatches: [
            {
              code: "FRAMEWORK_GAP",
              kind: "mismatch",
              label:
                "This opportunity appears framework-related and your listed memberships did not overlap",
            },
          ],
        }}
      />,
    );
    expect(container.innerHTML).toContain("Category overlap with your profile");
    expect(container.innerHTML).toContain("Possible mismatches");
  });

  it("labels external source links for assistive technology", () => {
    cleanup();
    render(
      <ExternalSourceLink href="https://canary-source.example/notice">
        Open source notice
      </ExternalSourceLink>,
    );
    expect(screen.getByText("(opens original source in a new tab)")).toBeTruthy();
  });

  it("renders scraped HTML as text and drops javascript: source links", () => {
    cleanup();
    const dto = toPaidDealDto({
      ...mappingInput,
      deal: {
        ...mappingInput.deal,
        source_title: "<img src=x onerror=alert(1)> XSS title",
        source_description: "<script>alert(1)</script><img src=x onerror=alert(1)>",
        source_url: "javascript:alert(1)",
        application_url: "javascript:alert(document.cookie)",
      },
    });
    const { container } = render(<DealPaidDetail deal={dto} />);
    const html = container.innerHTML;

    expect(html).not.toMatch(/<script[\s>]/i);
    expect(html).not.toMatch(/<img [^>]*onerror=/i);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(dto.sourceUrl).toBeNull();
    expect(dto.applicationUrl).toBeNull();
    expect(screen.queryByRole("link", { name: /Open source notice/i })).toBeNull();
  });
});
