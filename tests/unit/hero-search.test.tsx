// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryShortcuts } from "@/components/deals/category-shortcuts";
import { HeroSearchForm, HOME_SEARCH_EXAMPLES } from "@/components/deals/hero-search-form";

describe("homepage discovery controls", () => {
  it("submits the real public search form", () => {
    const { container } = render(<HeroSearchForm />);
    const form = container.querySelector("form");

    expect(form?.getAttribute("action")).toBe("/deals");
    expect(form?.getAttribute("method")).toBe("get");
    expect(screen.getByRole("searchbox", { name: "Search opportunities" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: HOME_SEARCH_EXAMPLES[0] }).getAttribute("href"),
    ).toBe(`/deals?q=${encodeURIComponent(HOME_SEARCH_EXAMPLES[0])}`);
  });

  it("links category shortcuts into existing search filters", () => {
    render(<CategoryShortcuts />);

    const technology = screen.getByRole("link", { name: "Technology" });
    expect(technology.getAttribute("href")).toBe(
      `/deals?category=${encodeURIComponent("Technology")}`,
    );
    expect(screen.queryByRole("link", { name: "Other" })).toBeNull();
  });
});
