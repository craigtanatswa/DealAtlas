// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState, ErrorState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { SiteFooter } from "@/components/navigation/site-footer";

describe("feedback patterns", () => {
  it("renders documented empty states", () => {
    render(<EmptyState kind="noDealsMatchFilters" />);
    expect(
      screen.getByRole("heading", { name: "No deals match these filters" }),
    ).toBeTruthy();
  });

  it("exposes a retry control on error states", () => {
    const retries: number[] = [];
    render(
      <ErrorState
        onRetry={() => {
          retries.push(1);
        }}
      />,
    );

    screen.getByRole("button", { name: "Try again" }).click();
    expect(retries).toHaveLength(1);
  });

  it("announces loading to assistive technology", () => {
    render(<LoadingState label="Loading workspace" />);
    expect(screen.getByText("Loading workspace")).toBeTruthy();
  });
});

describe("public footer", () => {
  it("links to legal and product pages without live counts", () => {
    const { container } = render(<SiteFooter />);

    expect(screen.getByRole("navigation", { name: "Footer" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find Deals" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d[\d,]+\s+opportunities/i);
  });
});
