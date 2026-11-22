import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { DEAL_PREVIEW_DETAIL_FIXTURE } from "@/components/deals/fixtures";
import { dealUnlockProps } from "@/components/deals/deal-unlock-props";
import { checkoutReturnUrl, parseCheckoutReturnTo } from "@/lib/deals/paths";
import type { DealViewerFree, DealViewerPro } from "@/lib/deals/viewer";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getCurrentEntitlement: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mocks.redirect(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth/session", () => ({
  getAuthUser: mocks.getAuthUser,
}));
vi.mock("@/lib/entitlements/service", () => ({
  getCurrentEntitlement: mocks.getCurrentEntitlement,
}));

const SLUG = "canary-deal-abc123";
const LOGIN_HREF = `/login?next=${encodeURIComponent(`/deals/${SLUG}`)}`;
const FOUNDING = { offered: true, sold_out: false };
const DEAL_ID = "123e4567-e89b-42d3-a456-426614174000";

const freeViewer: DealViewerFree = {
  mode: "free",
  dealId: DEAL_ID,
  saved: false,
  used: 0,
  limit: 1,
  founding: FOUNDING,
  paymentPending: false,
};

const proViewer: DealViewerPro = {
  mode: "pro",
  dealId: DEAL_ID,
  saved: true,
  used: 1,
  limit: null,
  founding: null,
  paymentPending: false,
  revealHref: `/app/deals/${DEAL_ID}`,
  returnTo: `/app/deals/${DEAL_ID}`,
};

describe("deal unlock return paths", () => {
  it("sends a free viewer back to the public deal after checkout", () => {
    const unlock = dealUnlockProps({
      viewer: freeViewer,
      slug: SLUG,
      loginHref: LOGIN_HREF,
      founding: FOUNDING,
    });

    expect(unlock).toMatchObject({
      mode: "free",
      returnTo: `/deals/${SLUG}`,
      founding: FOUNDING,
      paymentPending: false,
    });
    expect(unlock).not.toHaveProperty("revealHref");
  });

  it("does not add a return path for an anonymous viewer", () => {
    const unlock = dealUnlockProps({
      viewer: null,
      slug: SLUG,
      loginHref: LOGIN_HREF,
      founding: FOUNDING,
    });

    expect(unlock.mode).toBe("anonymous");
    expect(unlock).not.toHaveProperty("returnTo");
    expect(unlock).not.toHaveProperty("revealHref");
  });

  it("keeps the Pro viewer return path from the viewer API", () => {
    const unlock = dealUnlockProps({
      viewer: proViewer,
      slug: SLUG,
      loginHref: LOGIN_HREF,
      founding: FOUNDING,
    });

    expect(unlock.mode).toBe("pro");
    expect(unlock.returnTo).toBe(proViewer.returnTo);
    expect(unlock.revealHref).toBe(proViewer.revealHref);
  });

  it("accepts the public deal path and carries it to checkout success", () => {
    const returnTo = `/deals/${SLUG}`;

    expect(parseCheckoutReturnTo(returnTo)).toBe(returnTo);
    expect(
      new URL(
        checkoutReturnUrl("https://x.test/checkout/success", returnTo),
      ).searchParams.get("next"),
    ).toBe(returnTo);
  });

  it("redirects checkout success back to the public deal with upgraded=1", async () => {
    mocks.getAuthUser.mockResolvedValue({ id: "user-1" });
    const { default: CheckoutSuccessPage } = await import(
      "@/app/(marketing)/checkout/success/page"
    );

    await expect(
      CheckoutSuccessPage({
        searchParams: Promise.resolve({ next: `/deals/${SLUG}` }),
      }),
    ).rejects.toThrow(`REDIRECT:/deals/${SLUG}?upgraded=1`);

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/deals/${SLUG}?upgraded=1`,
    );
  });

  it("renders the free returnTo as a hidden input on the deal preview", () => {
    const unlock = dealUnlockProps({
      viewer: freeViewer,
      slug: SLUG,
      loginHref: LOGIN_HREF,
      founding: FOUNDING,
    });
    const html = renderToStaticMarkup(
      createElement(DealPreviewDetail, {
        deal: DEAL_PREVIEW_DETAIL_FIXTURE,
        unlock,
      }),
    );

    expect(html).toMatch(
      new RegExp(
        `<input[^>]*type="hidden"[^>]*name="returnTo"[^>]*value="/deals/${SLUG}"`,
      ),
    );
  });
});
