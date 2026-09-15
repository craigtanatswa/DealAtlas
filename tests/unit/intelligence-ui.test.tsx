// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IntelligencePaywall } from "@/components/intelligence/paywall";
import { ContractList, RenewalList } from "@/components/intelligence/lists";
import { DEALATLAS_ANALYSIS_LABEL, SOURCE_RECORD_LABEL } from "@/lib/intelligence/types";

describe("intelligence UI", () => {
  it("paywall never receives organisation identity", () => {
    const { container } = render(
      <IntelligencePaywall
        title="Buyers"
        description="The buyer directory is Pro-only."
        returnTo="/app/buyers"
      />,
    );
    expect(screen.getByRole("heading", { name: "Buyers" })).toBeTruthy();
    expect(container.textContent).not.toContain("Example City Council");
    expect(container.textContent).not.toContain("CANARY BUYER NEVER FREE");
  });

  it("labels inferred renewal signals as DealAtlas analysis", () => {
    render(
      <RenewalList
        items={[
          {
            dealId: "22222222-2222-4222-8222-222222222222",
            dealTitle: "Facilities retender",
            buyer: { id: "11111111-1111-4111-8111-111111111111", name: "Example City Council" },
            date: "2027-03-01",
            window: "upcoming",
            evidence: [
              {
                kind: "inference",
                label: DEALATLAS_ANALYSIS_LABEL,
                confidence: 0.46,
                field: "deal_insights.estimated_renewal_date",
                note: "DealAtlas inferred renewal date from stored analysis.",
              },
            ],
            primary: {
              kind: "inference",
              label: DEALATLAS_ANALYSIS_LABEL,
              confidence: 0.46,
              field: "deal_insights.estimated_renewal_date",
              note: "DealAtlas inferred renewal date from stored analysis.",
            },
            incumbents: [],
          },
        ]}
        empty="None"
      />,
    );
    expect(screen.getAllByText(DEALATLAS_ANALYSIS_LABEL).length).toBeGreaterThan(0);
    expect(screen.queryByText(SOURCE_RECORD_LABEL)).toBeNull();
    expect(screen.getByText("Facilities retender")).toBeTruthy();
  });

  it("renders recorded payment and performance facts without inventing amounts", () => {
    render(
      <ContractList
        contracts={[
          {
            id: "c1",
            dealId: "22222222-2222-4222-8222-222222222222",
            dealTitle: "Facilities contract",
            contractIdentifier: "CTR-1",
            status: "active",
            signedDate: null,
            startDate: "2024-04-01",
            endDate: "2027-03-31",
            extensionEndDate: "2028-03-31",
            originalValue: 100000,
            currentValue: 100000,
            currency: "GBP",
            buyer: { id: "11111111-1111-4111-8111-111111111111", name: "Example City Council" },
            suppliers: [{ id: "33333333-3333-4333-8333-333333333333", name: "Example Facilities Ltd" }],
            payments: [
              {
                id: "p1",
                paymentDate: "2025-04-01",
                amountNetVat: 25000,
                currency: "GBP",
              },
            ],
            performance: [
              {
                id: "pf1",
                reportDate: "2025-09-01",
                kpiName: "KPI 1",
                rating: "Good",
                poorPerformance: false,
                breachReported: false,
              },
            ],
          },
        ]}
        empty="None"
      />,
    );
    expect(screen.getByText("Facilities contract")).toBeTruthy();
    expect(screen.getByText(/25,000/)).toBeTruthy();
    expect(screen.getByText(/KPI 1/)).toBeTruthy();
    expect(screen.queryByText(/estimated payment/i)).toBeNull();
  });
});
