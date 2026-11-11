import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(async (): Promise<{ id: string } | null> => ({ id: "u1" })),
  readFoundingPublicCount: vi.fn(async () => ({ offered: true, sold_out: false })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentAccount: mocks.getCurrentAccount,
}));
vi.mock("@/lib/billing/founding-public", () => ({
  readFoundingPublicCount: mocks.readFoundingPublicCount,
}));

import CheckoutPage from "@/app/(marketing)/checkout/page";

const PLAN_LINE = "Lifetime deal: £250 one-time (VAT included). Limited places.";

function renderPage(searchParams: Record<string, string | string[] | undefined>) {
  return CheckoutPage({ searchParams: Promise.resolve(searchParams) });
}

async function redirectMessage(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<string> {
  try {
    await renderPage(searchParams);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected a redirect");
}

beforeEach(() => {
  mocks.getCurrentAccount.mockResolvedValue({ id: "u1" });
  mocks.readFoundingPublicCount.mockResolvedValue({ offered: true, sold_out: false });
});

describe("checkout Lifetime query", () => {
  it("redirects legacy plan values to plan=lifetime", async () => {
    for (const plan of ["FOUNDING", "founding_lifetime"]) {
      await expect(renderPage({ plan })).rejects.toThrow(
        "REDIRECT:/checkout?plan=lifetime",
      );
    }
  });

  it("renders the Lifetime summary and posts founding_lifetime for plan=lifetime", async () => {
    const element = await renderPage({ plan: "lifetime" });
    const html = renderToStaticMarkup(element);

    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="planKey"[^>]*value="founding_lifetime"/,
    );
    expect(html).toContain(PLAN_LINE);
  });

  it("redirects a signed-out visitor to the Lifetime signup path", async () => {
    mocks.getCurrentAccount.mockResolvedValue(null);

    const message = await redirectMessage({ plan: "lifetime" });
    expect(message).toMatch(/^REDIRECT:/);

    const url = decodeURIComponent(message.replace(/^REDIRECT:/, ""));
    expect(url).toContain("/checkout?plan=lifetime");
    expect(url).not.toMatch(/founding/i);
  });
});
