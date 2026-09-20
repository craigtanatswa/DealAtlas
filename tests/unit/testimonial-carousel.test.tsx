// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TestimonialCarousel } from "@/components/marketing/testimonial-carousel";
import { HOME_TESTIMONIALS } from "@/components/marketing/testimonial-data";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  );
  HTMLElement.prototype.scrollTo = () => undefined;
});

describe("home testimonial carousel", () => {
  it("renders placeholder testimonials without fake metrics or deal fetches", () => {
    render(<TestimonialCarousel />);

    for (const item of HOME_TESTIMONIALS) {
      expect(screen.getAllByText(item.name).length).toBeGreaterThan(0);
      expect(screen.getAllByText(item.company).length).toBeGreaterThan(0);
    }

    expect(screen.queryByText("DM")).toBeNull();
    expect(screen.getByRole("button", { name: "Previous testimonials" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next testimonials" })).toBeTruthy();
    expect(screen.getByLabelText("Show testimonial from Daniel Mercer")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/10,000\+|£50M|4\.9\/5/);
  });
});
