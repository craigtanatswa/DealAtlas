// @vitest-environment jsdom
import { existsSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PaginationNav } from "@/components/deals/pagination-nav";
import {
  isPublicDealsPageOutOfRange,
  PUBLIC_DEALS_MAX_PAGES,
  PUBLIC_DEALS_PAGE_SIZE,
  publicDealsPageCount,
} from "@/lib/search/params";

afterEach(cleanup);

const filters = { page: 1, limit: PUBLIC_DEALS_PAGE_SIZE };

function linkedPages(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll("a[href]"))
    .map((a) => new URL(a.getAttribute("href")!, "http://x").searchParams.get("page"))
    .map((p) => (p ? Number(p) : 1));
}

describe("/deals pager reach", () => {
  it("caps the page count at what public viewers can load", () => {
    expect(PUBLIC_DEALS_MAX_PAGES).toBe(5);
    expect(publicDealsPageCount(334, 10)).toBe(5);
    expect(publicDealsPageCount(23, 10)).toBe(3);
    expect(publicDealsPageCount(0, 10)).toBe(1);
  });

  it("never links past the cap (no page 7 or 34 for 334 results)", () => {
    const { container, unmount } = render(
      <PaginationNav
        page={1}
        pageSize={10}
        total={334}
        filters={filters}
        maxPages={PUBLIC_DEALS_MAX_PAGES}
      />,
    );
    const pages = linkedPages(container);
    expect(Math.max(...pages)).toBe(5);
    expect(pages).not.toContain(7);
    expect(pages).not.toContain(34);
    unmount();

    render(
      <PaginationNav
        page={5}
        pageSize={10}
        total={334}
        filters={{ ...filters, page: 5 }}
        maxPages={PUBLIC_DEALS_MAX_PAGES}
      />,
    );
    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
    expect(screen.getByRole("button", { name: "5" }).getAttribute("aria-current")).toBe("page");
  });

  it("marks pages past the pager as out of range (404)", () => {
    expect(isPublicDealsPageOutOfRange(1, 334, 10)).toBe(false);
    expect(isPublicDealsPageOutOfRange(5, 334, 10)).toBe(false);
    expect(isPublicDealsPageOutOfRange(6, 334, 10)).toBe(true);
    expect(isPublicDealsPageOutOfRange(7, 334, 10)).toBe(true);
    expect(isPublicDealsPageOutOfRange(34, 334, 10)).toBe(true);
    expect(isPublicDealsPageOutOfRange(4, 23, 10)).toBe(true);
    expect(isPublicDealsPageOutOfRange(2, 0, 10)).toBe(true);
    expect(isPublicDealsPageOutOfRange(1, 0, 10)).toBe(false);
  });

  it("has no /deals loading fallback, so notFound() sends a real 404 status", () => {
    expect(existsSync(path.resolve(process.cwd(), "app/(marketing)/deals/loading.tsx"))).toBe(false);
  });
});
