// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { CategoryShortcuts } from "@/components/deals/category-shortcuts";
import { HeroSearchForm, HOME_SEARCH_EXAMPLES } from "@/components/deals/hero-search-form";
import { DEAL_CATEGORY_CATALOG } from "@/lib/matching/categories";
import {
  HOME_SEARCH_CHIP_REVALIDATE_SECONDS,
  homeSearchChipCandidates,
  pickHomeSearchChips,
} from "@/lib/search/home-chips";

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

  it("lists only search examples with published results", () => {
    expect(HOME_SEARCH_EXAMPLES).not.toContain("maize seed");
    expect(HOME_SEARCH_EXAMPLES).toEqual([
      "IT services",
      "energy",
      "water",
      "transport",
      "education",
      "construction",
    ]);
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

describe("live homepage search chips", () => {
  it("drops zero-count chips and keeps the top N by live count", () => {
    const counted = [
      { label: "IT services", href: "/deals?q=IT%20services", count: 0 },
      { label: "energy", href: "/deals?q=energy", count: 4 },
      { label: "water", href: "/deals?q=water", count: null },
      { label: "Technology", href: "/deals?category=Technology", count: 12 },
      { label: "Healthcare", href: "/deals?category=Healthcare", count: 4 },
      { label: "Education", href: "/deals?category=Education", count: 1 },
    ];
    expect(pickHomeSearchChips(counted, 3)).toEqual([
      { label: "Technology", href: "/deals?category=Technology" },
      { label: "energy", href: "/deals?q=energy" },
      { label: "Healthcare", href: "/deals?category=Healthcare" },
    ]);
    const all = pickHomeSearchChips(counted, 10).map((chip) => chip.label);
    expect(all).not.toContain("IT services");
    expect(all).not.toContain("water");
    expect(pickHomeSearchChips(counted.map((c) => ({ ...c, count: 0 })))).toEqual([]);
  });

  it("uses only existing curated terms and category labels", () => {
    const candidates = homeSearchChipCandidates();
    const allowed = new Set<string>([
      ...HOME_SEARCH_EXAMPLES,
      ...DEAL_CATEGORY_CATALOG.filter((c) => c.slug !== "other").map((c) => c.name),
    ]);
    expect(candidates.every((c) => allowed.has(c.label))).toBe(true);
    expect(candidates.every((c) => /^\/deals\?(q|category)=/.test(c.href))).toBe(true);
    expect(HOME_SEARCH_CHIP_REVALIDATE_SECONDS).toBe(3600);
  });

  it("renders the live chips and hides the Try line when none have results", () => {
    const { container, unmount } = render(
      <HeroSearchForm examples={[{ label: "Technology", href: "/deals?category=Technology" }]} />,
    );
    expect(screen.getByRole("link", { name: "Technology" }).getAttribute("href")).toBe(
      "/deals?category=Technology",
    );
    expect(container.textContent).toContain("Try");
    unmount();
    const empty = render(<HeroSearchForm examples={[]} />);
    expect(empty.container.textContent).not.toContain("Try");
  });
});
