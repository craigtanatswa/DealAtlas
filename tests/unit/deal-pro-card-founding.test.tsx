// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DealProCard } from "@/components/deals/deal-pro-card";
import {
  FOUNDING_CAP,
  FOUNDING_PLAN_KEY,
  foundingSignupPath,
} from "@/lib/billing/founding-ui";

afterEach(cleanup);

const open = { offered: true, remaining: 18, cap: FOUNDING_CAP };
const full = { offered: true, remaining: 0, cap: FOUNDING_CAP };
const notOffered = { offered: false, remaining: 0, cap: FOUNDING_CAP };
const returnTo = "/deals/example-slug";

function planKeys(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll("input[name='planKey']")).map((input) =>
    input.getAttribute("value"),
  );
}

describe("deal page founding button", () => {
  it("posts FOUNDING for a signed-in free user", () => {
    const { container } = render(
      <DealProCard mode="free" founding={open} returnTo={returnTo} alertsHref="/app/alerts" />,
    );
    const button = screen.getByRole("button", { name: /founding member/i });
    const form = button.closest("form")!;
    expect(form.querySelector("input[name='planKey']")?.getAttribute("value")).toBe(
      FOUNDING_PLAN_KEY,
    );
    expect(FOUNDING_PLAN_KEY).toBe("FOUNDING");
    expect(form.querySelector("input[name='returnTo']")?.getAttribute("value")).toBe(returnTo);
    expect(form.getAttribute("data-analytics-plan")).toBe("founding");
    expect(planKeys(container)).not.toContain("PRO_ANNUAL");
  });

  it("sends signed-out visitors to signup then the founding checkout", () => {
    render(<DealProCard mode="anonymous" founding={open} alertsHref="/signup" />);
    expect(
      screen.getByRole("link", { name: /founding member/i }).getAttribute("href"),
    ).toBe(foundingSignupPath());
  });

  it.each([
    ["full", full],
    ["not offered", notOffered],
    ["unknown", undefined],
  ])("hides the founding button when founding is %s", (_name, founding) => {
    const { container } = render(
      <DealProCard mode="free" founding={founding} returnTo={returnTo} alertsHref="/app/alerts" />,
    );
    expect(screen.queryByText(/founding/i)).toBeNull();
    expect(container.textContent).not.toMatch(/£290|places left|Locked for life/);
    expect(planKeys(container)).not.toContain(FOUNDING_PLAN_KEY);
  });
});
