// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import {
  PAYMENT_PENDING_POLL_MS,
  PAYMENT_PENDING_TIMEOUT_MS,
} from "@/components/billing/payment-pending-notice";
import { DealProCard } from "@/components/deals/deal-pro-card";
import { paymentPendingFor } from "@/lib/billing/payment-pending";

const TIMED_OUT = /Still confirming\? Refresh the page, or contact support if it doesn’t update\./;

function card(paymentPending: boolean) {
  return <DealProCard mode="free" alertsHref="/app/alerts" paymentPending={paymentPending} />;
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("payment pending poll", () => {
  it("uses a 5s interval and a 2 minute limit", () => {
    expect(PAYMENT_PENDING_POLL_MS).toBe(5_000);
    expect(PAYMENT_PENDING_TIMEOUT_MS).toBe(120_000);
  });

  it("refreshes the server render every 5s", () => {
    render(card(true));
    advance(4_999);
    expect(refresh).not.toHaveBeenCalled();
    advance(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    advance(5_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    advance(15_000);
    expect(refresh).toHaveBeenCalledTimes(5);
    expect(screen.getByText(/Details unlock here automatically/)).toBeTruthy();
  });

  it("stops at 2 minutes and switches the copy", () => {
    render(card(true));
    advance(PAYMENT_PENDING_TIMEOUT_MS - 1);
    expect(refresh).toHaveBeenCalledTimes(23);
    expect(screen.getByRole("status").textContent).not.toMatch(TIMED_OUT);
    advance(1);
    const calls = refresh.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(24);
    expect(screen.getByRole("status").textContent).toMatch(TIMED_OUT);
    expect(screen.queryByText(/Details unlock here automatically/)).toBeNull();
    expect(screen.getByRole("link", { name: "contact support" }).getAttribute("href")).toBe("/contact");
    advance(10 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(calls);
  });

  it("stops as soon as the server render is no longer pending", () => {
    const view = render(card(true));
    advance(10_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    view.rerender(card(false));
    expect(screen.queryByText("Confirming your payment…")).toBeNull();
    advance(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("clears its timers on unmount", () => {
    const clearInterval = vi.spyOn(window, "clearInterval");
    const clearTimeout = vi.spyOn(window, "clearTimeout");
    const view = render(card(true));
    view.unmount();
    expect(clearInterval).toHaveBeenCalled();
    expect(clearTimeout).toHaveBeenCalled();
    advance(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("pauses while the tab is hidden", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(card(true));
    advance(30_000);
    expect(refresh).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    advance(5_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not poll when not pending", () => {
    render(card(false));
    advance(PAYMENT_PENDING_TIMEOUT_MS * 2);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText("Confirming your payment…")).toBeNull();
  });
});

describe("who sees the pending state", () => {
  it("only a signed-in, non-Pro user back from checkout", () => {
    expect(paymentPendingFor({ signedIn: true, upgraded: true, isPro: false })).toBe(true);
    expect(paymentPendingFor({ signedIn: true, upgraded: true, isPro: true })).toBe(false);
    expect(paymentPendingFor({ signedIn: false, upgraded: true, isPro: false })).toBe(false);
    expect(paymentPendingFor({ signedIn: true, upgraded: false, isPro: false })).toBe(false);
  });

  it.each([
    ["/app/deals/[id]", "app/(app)/app/deals/[id]/page.tsx", /paymentPending: paymentPendingFor\(\{ signedIn: true, upgraded, isPro \}\)/],
    ["/deals/[slug]", "app/(marketing)/deals/[slug]/page.tsx", /paymentPending: paymentPendingFor\(\{\s*signedIn: Boolean\(user\),\s*upgraded,\s*isPro: mode === "pro",\s*\}\)/],
  ])("%s derives pending from the server entitlement", (_route, file, pattern) => {
    const source = readFileSync(file, "utf8");
    expect(source).toMatch(pattern);
    expect(source).toMatch(/isProEntitlement\(entitlement\)/);
    expect(source.match(/paymentPending:/g)).toHaveLength(1);
  });
});
