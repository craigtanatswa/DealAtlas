// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HeroCategoryCloud } from "@/components/marketing/hero-category-cloud";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubMatchMedia(options: {
  desktop?: boolean;
  tablet?: boolean;
  reduceMotion?: boolean;
}) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => {
      const matches = query.includes("prefers-reduced-motion")
        ? Boolean(options.reduceMotion)
        : query.includes("min-width: 1280px")
          ? Boolean(options.desktop)
          : query.includes("min-width: 768px")
            ? Boolean(options.tablet ?? options.desktop)
            : false;

      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      };
    },
  );
}

describe("hero category cloud", () => {
  it("is decorative and keeps a static reduced-motion selection", async () => {
    stubMatchMedia({ reduceMotion: true, tablet: true });
    render(<HeroCategoryCloud />);

    await waitFor(() => {
      expect(screen.getByText("Technology")).toBeTruthy();
    });

    expect(screen.queryByRole("link")).toBeNull();
    expect(document.querySelector("[aria-hidden='true']")).toBeTruthy();
  });
});
