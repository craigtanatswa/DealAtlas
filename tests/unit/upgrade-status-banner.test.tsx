// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpgradeStatusBanner } from "@/components/billing/upgrade-status-banner";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plan: "FREE" }),
    }),
  );
});

afterEach(() => {
  cleanup();
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
  });
});
