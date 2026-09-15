import { describe, expect, it } from "vitest";

import {
  buildRenewalSignal,
  contractExpiryFacts,
  dealDateFacts,
  insightRenewalFact,
  selectRenewalFacts,
} from "@/lib/intelligence/renewals";
import { DEALATLAS_ANALYSIS_LABEL, SOURCE_RECORD_LABEL } from "@/lib/intelligence/types";

const NOW = new Date("2026-09-15T12:00:00.000Z");

describe("renewal evidence", () => {
  it("does not invent a date from duration or missing fields", () => {
    expect(
      buildRenewalSignal(
        {
          dealId: "d1",
          dealTitle: "Notice",
          dealType: "PUBLIC_TENDER",
          status: "AWARDED",
          buyer: null,
          incumbents: [],
          facts: [],
        },
        NOW,
      ),
    ).toBeNull();
  });

  it("uses recorded contract end dates as source facts", () => {
    const signal = buildRenewalSignal(
      {
        dealId: "d1",
        dealTitle: "Facilities contract",
        dealType: "AWARD",
        status: "ACTIVE",
        buyer: { id: "b1", name: "Example Council" },
        incumbents: [],
        facts: contractExpiryFacts({
          endDate: "2027-03-01",
          extensionEndDate: "2028-03-01",
        }),
      },
      NOW,
    );

    expect(signal?.date).toBe("2028-03-01");
    expect(signal?.primary.label).toBe(SOURCE_RECORD_LABEL);
    expect(signal?.primary.field).toBe("contracts.extension_end_date");
    expect(signal?.window).toBe("upcoming");
  });

  it("labels insight-only dates as DealAtlas analysis and drops duplicates of source dates", () => {
    const facts = selectRenewalFacts(
      [
        ...dealDateFacts({
          contractEndDate: "2027-01-15",
          extensionEndDate: null,
          estimatedRenewalDate: "2027-01-15",
          nextProcurementDate: null,
        }),
        insightRenewalFact("2027-01-15")!,
        insightRenewalFact("2027-06-01")!,
      ],
      NOW,
    );

    expect(facts.some((fact) => fact.kind === "inference" && fact.date.startsWith("2027-01-15"))).toBe(
      false,
    );
    const inferred = facts.find((fact) => fact.kind === "inference");
    expect(inferred?.date.startsWith("2027-06-01")).toBe(true);
    expect(inferred?.kind).toBe("inference");

    const signal = buildRenewalSignal(
      {
        dealId: "d2",
        dealTitle: "Inferred only",
        dealType: "PUBLIC_TENDER",
        status: "CLOSED",
        buyer: null,
        incumbents: [],
        facts: [insightRenewalFact("2027-06-01")!],
      },
      NOW,
    );
    expect(signal?.primary.label).toBe(DEALATLAS_ANALYSIS_LABEL);
    expect(signal?.date).toBe("2027-06-01");
  });

  it("keeps an undated live contract-renewal notice without fabricating a date", () => {
    const signal = buildRenewalSignal(
      {
        dealId: "d3",
        dealTitle: "Renewal competition",
        dealType: "CONTRACT_RENEWAL",
        status: "OPEN",
        buyer: null,
        incumbents: [],
        facts: [],
      },
      NOW,
    );
    expect(signal?.date).toBeNull();
    expect(signal?.window).toBe("undated");
    expect(signal?.primary.field).toBe("deal_type");
  });
});
