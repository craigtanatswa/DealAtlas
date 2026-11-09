// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MatchReasons } from "@/components/deals/match-reasons";
import { MatchScore } from "@/components/deals/match-score";

afterEach(cleanup);

describe("match upsell placeholders", () => {
  it("MatchScore shows a Pro upsell and no number without a score", () => {
    const { container } = render(<MatchScore score={null} />);
    expect(screen.getByRole("link", { name: /Match score with DealAtlas Pro/ })).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/pricing");
    expect(container.textContent).not.toMatch(/\d/);
  });
  it("MatchScore still renders a Pro score", () => {
    render(<MatchScore score={81} />);
    expect(screen.getByLabelText("Match score 81 out of 100")).toBeTruthy();
  });
  it("MatchReasons shows the upsell copy without a score", () => {
    render(<MatchReasons score={null} reasons={[]} />);
    expect(screen.getByText(/fits your company profile with DealAtlas Pro/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Match score with DealAtlas Pro/ })).toBeTruthy();
  });
});
