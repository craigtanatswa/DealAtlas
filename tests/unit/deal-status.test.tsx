// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { DealCard } from "@/components/deals/deal-card";
import { DealStatusBadge } from "@/components/deals/deal-status";
import { DEAL_CARD_FIXTURES } from "@/components/deals/fixtures";

describe("upcoming status badge", () => {
  it("labels UPCOMING as Upcoming with high-contrast classes", () => {
    render(<DealStatusBadge status="UPCOMING" />);

    const label = screen.getByText("Upcoming");
    const badge = label.closest('[data-slot="badge"]');
    expect(badge).toBeTruthy();
    expect(badge?.className).toContain("border-blue-900");
    expect(badge?.className).toContain("bg-blue-800");
    expect(badge?.className).toContain("text-white");
    expect(screen.queryByText("Opening soon")).toBeNull();
  });

  it("shows the Upcoming badge on a deal card", () => {
    render(
      <DealCard
        deal={{
          ...DEAL_CARD_FIXTURES.freePreview,
          slug: "upcoming-lighting-upgrade-opportunity",
          status: "UPCOMING",
        }}
      />,
    );

    expect(screen.getByText("Upcoming")).toBeTruthy();
    expect(screen.queryByText("Opening soon")).toBeNull();
  });
});
