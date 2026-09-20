// @vitest-environment jsdom
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HeaderSearch } from "@/components/navigation/header-search";

afterEach(() => {
  cleanup();
});

describe("header search", () => {
  it("submits a public keyword query to /deals", () => {
    const { container } = render(<HeaderSearch />);
    const form = container.querySelector("form");

    expect(form).not.toBeNull();
    expect(form?.getAttribute("action")).toBe("/deals");
    expect(form?.getAttribute("method")).toBe("get");
    expect(
      within(form as HTMLElement)
        .getByRole("searchbox", { name: "Search opportunities" })
        .getAttribute("name"),
    ).toBe("q");
    expect(
      within(form as HTMLElement)
        .getByRole("button", { name: "Search" })
        .getAttribute("type"),
    ).toBe("submit");
  });

  it("can target the signed-in Discover search", () => {
    const { container } = render(
      <HeaderSearch path="/app/search" idPrefix="app-header" />,
    );
    const form = container.querySelector("form");

    expect(form?.getAttribute("action")).toBe("/app/search");
    expect(
      within(form as HTMLElement)
        .getByRole("searchbox", { name: "Search opportunities" })
        .getAttribute("id"),
    ).toBe("app-header-q");
  });
});
