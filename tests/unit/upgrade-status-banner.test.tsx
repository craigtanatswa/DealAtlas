// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  UPGRADE_POLL_MS,
  UPGRADE_TIMEOUT_MS,
  UpgradeStatusBanner,
} from "@/components/billing/upgrade-status-banner";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const PENDING = /This page will update automatically\. Details stay locked until your payment is confirmed\. You don't need to pay again\./;
const TIMED_OUT = /Still confirming\? Refresh the page, or contact support if it doesn't update\./;

let plan = "FREE";
const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ plan }) }));

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function bannerText(): string {
  return screen.getByRole("status").textContent ?? "";
}

beforeEach(() => {
  plan = "FREE";
  fetchMock.mockClear();
  router.refresh.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("UpgradeStatusBanner", () => {
  it("shows the pending state while the entitlement is not Pro", () => {
    render(<UpgradeStatusBanner initialPro={false} />);

    expect(screen.getByText(/Confirming your payment/)).toBeTruthy();
    expect(screen.queryByText(/Pro is active/)).toBeNull();
  });

  it("shows the success state when the server entitlement is Pro", () => {
    render(<UpgradeStatusBanner initialPro />);

    expect(screen.getByText(/Pro is active\./)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("UpgradeStatusBanner timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("checks every 2s with a 2 minute limit", () => {
    expect(UPGRADE_POLL_MS).toBe(2_000);
    expect(UPGRADE_TIMEOUT_MS).toBe(120_000);
  });

  it("polls the entitlement before 2 minutes with the pending copy", async () => {
    render(<UpgradeStatusBanner initialPro={false} />);
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/billing/entitlement", { cache: "no-store" });
    await advance(UPGRADE_POLL_MS * 5);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    await advance(UPGRADE_TIMEOUT_MS - UPGRADE_POLL_MS * 5 - 1);
    expect(bannerText()).toMatch(PENDING);
    expect(bannerText()).not.toMatch(TIMED_OUT);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Open billing" })).toBeNull();
  });

  it("stops polling after 2 minutes and shows the copy with a /contact link", async () => {
    render(<UpgradeStatusBanner initialPro={false} />);
    await advance(UPGRADE_TIMEOUT_MS);
    const calls = fetchMock.mock.calls.length;
    // Initial check plus one every 2s before the limit.
    expect(calls).toBe(UPGRADE_TIMEOUT_MS / UPGRADE_POLL_MS);
    expect(bannerText()).toMatch(TIMED_OUT);
    expect(bannerText()).not.toMatch(PENDING);
    expect(screen.getByRole("link", { name: "contact support" }).getAttribute("href")).toBe("/contact");
    expect(screen.getByRole("link", { name: "Open billing" }).getAttribute("href")).toBe("/app/billing");
    expect(screen.queryByRole("button")).toBeNull();

    await advance(10 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("refreshes once and shows success when Pro arrives before the timeout", async () => {
    render(<UpgradeStatusBanner initialPro={false} />);
    await advance(UPGRADE_POLL_MS * 10);
    expect(router.refresh).not.toHaveBeenCalled();

    plan = "PRO";
    await advance(UPGRADE_POLL_MS);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(bannerText()).toMatch(/Pro is active\./);

    const calls = fetchMock.mock.calls.length;
    await advance(UPGRADE_TIMEOUT_MS);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(TIMED_OUT)).toBeNull();
  });
});
