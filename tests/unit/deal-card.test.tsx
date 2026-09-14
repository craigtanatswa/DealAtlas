// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DealCard } from "@/components/deals/deal-card";
import { DEAL_CARD_FIXTURES } from "@/components/deals/fixtures";
import { LockedField } from "@/components/deals/locked-field";
import { UnlockPanel } from "@/components/deals/unlock-panel";

describe("deal card fixtures", () => {
  it("renders sanitised preview fields and a view opportunity action", () => {
    render(<DealCard deal={DEAL_CARD_FIXTURES.freePreview} />);

    expect(
      screen.getByRole("heading", {
        name: DEAL_CARD_FIXTURES.freePreview.previewTitle,
      }),
    ).toBeTruthy();
    expect(screen.getByText("Private buyer")).toBeTruthy();
    expect(screen.getByText("£250k–£500k")).toBeTruthy();
    expect(screen.getByText("Within 3 weeks")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "View opportunity" });
    expect(cta.getAttribute("href")).toBe(
      "/deals/cloud-contact-centre-platform-opportunity",
    );
    expect(screen.queryByText(/buyer identity/i)).toBeNull();
    expect(screen.queryByText(/http/i)).toBeNull();
  });

  it("shows an optional match score without colour-only labelling", () => {
    render(<DealCard deal={DEAL_CARD_FIXTURES.closingPublic} />);

    expect(screen.getByLabelText("Match score 72 out of 100")).toBeTruthy();
    expect(screen.getByText("Match 72")).toBeTruthy();
    expect(screen.getByText("Public buyer")).toBeTruthy();
  });
});

describe("locked intelligence", () => {
  it("renders placeholder benefits without a value slot", () => {
    render(
      <LockedField label="Buyer identity" benefit="See who is buying" />,
    );

    expect(
      screen.getByLabelText("Buyer identity is locked. See who is buying"),
    ).toBeTruthy();
    expect(screen.getByText("See who is buying")).toBeTruthy();
    expect(screen.getByText(/placeholder only/i)).toBeTruthy();
  });

  it("does not accept or display a protected value on the unlock panel", () => {
    const { container } = render(<UnlockPanel />);

    expect(
      screen.getByRole("heading", {
        name: "Unlock the buyer and pursue this opportunity",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Unlock with DealAtlas Pro" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/CANARY/);
    expect(container.innerHTML).not.toMatch(/blur/);
  });
});
