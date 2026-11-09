// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DealPaidDetail } from "@/components/deals/deal-paid-detail";
import { TED_ATTRIBUTION } from "@/components/deals/ted-attribution";
import { toPaidDealDto, type PaidDealMappingInput } from "@/lib/deals/paid-dto";

afterEach(cleanup);

function paidInput(sourceKey: string, sourceName: string): PaidDealMappingInput {
  return {
    deal: {
      id: "22222222-2222-4222-8222-222222222222",
      source_title: "Specialised software procurement",
      source_description: "Official notice summary for entitled subscribers.",
      reference: "REF-987654",
      ocid: "ocds-example-123456",
      external_primary_id: "ext-example",
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
      source_url: "https://source.example/notice",
      application_url: "https://source.example/apply",
      first_published_at: "2026-05-01T00:00:00.000Z",
      latest_source_at: "2026-05-02T00:00:00.000Z",
    },
    buyer: {
      id: "11111111-1111-4111-8111-111111111111",
      canonical_name: "Example Buyer",
      website: "https://buyer.example",
      domain: "buyer.example",
      email: "procurement@buyer.example",
      phone: "+441111111111",
      city: "London",
      region: "England",
      country_code: "GB",
    },
    source: {
      id: "33333333-3333-4333-8333-333333333333",
      name: sourceName,
      source_key: sourceKey,
      source_type: "GOVERNMENT_OPEN_DATA",
      base_url: "https://source.example",
      reuse_status: "OPEN_LICENSE",
      licence_name: "Open licence",
      licence_url: "https://source.example/licence",
      terms_url: null,
    },
    notices: [],
    documents: [],
    lots: [],
    requirements: [],
    awardCriteria: [],
  };
}

describe("TED attribution", () => {
  it("renders the TED attribution on the paid detail for a TED source", () => {
    const dto = toPaidDealDto(paidInput("ted", "Tenders Electronic Daily"));
    expect(dto.source?.sourceKey).toBe("ted");

    const { container } = render(<DealPaidDetail deal={dto} />);

    expect(container.innerHTML).toContain(TED_ATTRIBUTION);
  });

  it("does not render the TED attribution for find-a-tender", () => {
    const dto = toPaidDealDto(paidInput("find-a-tender", "Find a Tender"));

    const { container } = render(<DealPaidDetail deal={dto} />);
    const html = container.innerHTML;

    expect(html).not.toContain("European Union");
    expect(html).not.toContain(TED_ATTRIBUTION);
  });
});
