// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element, @next/next/no-html-link-for-pages */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/guides",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  isInternalPathChange,
  RouteLoadingSlot,
  ROUTE_LOADING_SETTLE_TIMEOUT_MS,
  ROUTE_LOADING_SHOW_DELAY_MS,
} from "@/components/feedback/route-loading";

const here = "https://dealatlas.uk/guides";

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderSlot(child: ReactNode = <p>Page content</p>) {
  return render(<RouteLoadingSlot>{child}</RouteLoadingSlot>);
}

describe("isInternalPathChange", () => {
  it("accepts same-origin path or query changes", () => {
    expect(isInternalPathChange("https://dealatlas.uk/deals", here)).toBe(true);
    expect(isInternalPathChange("/deals?q=cloud", here)).toBe(true);
    expect(isInternalPathChange("https://dealatlas.uk/guides?page=2", here)).toBe(
      true,
    );
  });

  it("ignores hash-only, external, and non-http links", () => {
    expect(isInternalPathChange("https://dealatlas.uk/guides#main", here)).toBe(
      false,
    );
    expect(isInternalPathChange("https://example.com/deals", here)).toBe(false);
    expect(isInternalPathChange("mailto:hello@dealatlas.uk", here)).toBe(false);
  });
});

describe("RouteLoadingSlot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/guides");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("hash-only popstate does not show the loader", async () => {
    renderSlot();
    window.history.pushState({}, "", "/guides#section");

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await advance(ROUTE_LOADING_SHOW_DELAY_MS);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Page content")).toBeTruthy();
  });

  it("pageshow with persisted=true clears the loader", async () => {
    renderSlot(
      <>
        <a href="/deals">Find Deals</a>
        <p>Page content</p>
      </>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Find Deals" }));
    await advance(ROUTE_LOADING_SHOW_DELAY_MS);
    expect(screen.getByRole("status")).toBeTruthy();

    await act(async () => {
      const event = new Event("pageshow");
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Page content")).toBeTruthy();
  });

  it("a preventDefault anchor does not start the loader", async () => {
    renderSlot(
      <>
        <a
          href="/deals"
          onClick={(event) => {
            event.preventDefault();
          }}
        >
          Stay
        </a>
        <p>Page content</p>
      </>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Stay" }));
    await advance(ROUTE_LOADING_SHOW_DELAY_MS);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Page content")).toBeTruthy();
  });

  it("the 8s cap clears the loader", async () => {
    renderSlot(
      <>
        <a href="/deals">Find Deals</a>
        <p>Page content</p>
      </>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Find Deals" }));
    await advance(ROUTE_LOADING_SHOW_DELAY_MS);
    expect(screen.getByRole("status")).toBeTruthy();

    await advance(ROUTE_LOADING_SETTLE_TIMEOUT_MS);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Page content")).toBeTruthy();
  });
});
