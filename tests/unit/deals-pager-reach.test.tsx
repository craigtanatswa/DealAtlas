// @vitest-environment jsdom
import { existsSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PaginationNav } from "@/components/deals/pagination-nav";
import {
  isPublicDealsPageOutOfRange,
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
  it("counts every real result page", () => {
    expect(publicDealsPageCount(334, 10)).toBe(34);
    expect(publicDealsPageCount(330, 10)).toBe(33);
    expect(publicDealsPageCount(23, 10)).toBe(3);
    expect(publicDealsPageCount(1, 10)).toBe(1);
    expect(publicDealsPageCount(0, 10)).toBe(1);
  });

  it("links up to the real last page and no further", () => {
    const { container, unmount } = render(
      <PaginationNav page={1} pageSize={10} total={334} filters={filters} />,
    );
    expect(Math.max(...linkedPages(container))).toBe(34);
    expect(screen.getByText(/of 334/)).toBeTruthy();
    unmount();

    const last = render(
      <PaginationNav page={34} pageSize={10} total={334} filters={{ ...filters, page: 34 }} />,
    );
    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
    expect(screen.getByRole("button", { name: "34" }).getAttribute("aria-current")).toBe("page");
    expect(linkedPages(last.container)).not.toContain(35);
  });

  it("is out of range (404) only past the real last page", () => {
    expect(isPublicDealsPageOutOfRange(1, 334, 10)).toBe(false);
    expect(isPublicDealsPageOutOfRange(6, 334, 10)).toBe(false);
    expect(isPublicDealsPageOutOfRange(34, 334, 10)).toBe(false);
    expect(isPublicDealsPageOutOfRange(35, 334, 10)).toBe(true);
    expect(isPublicDealsPageOutOfRange(3, 23, 10)).toBe(false);
    expect(isPublicDealsPageOutOfRange(4, 23, 10)).toBe(true);
    expect(isPublicDealsPageOutOfRange(2, 0, 10)).toBe(true);
    expect(isPublicDealsPageOutOfRange(1, 0, 10)).toBe(false);
  });

  it("has no /deals loading fallback, so notFound() sends a real 404 status", () => {
    expect(existsSync(path.resolve(process.cwd(), "app/(marketing)/deals/loading.tsx"))).toBe(false);
  });
});
