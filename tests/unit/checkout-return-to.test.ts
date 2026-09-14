import { describe, expect, it } from "vitest";

import {
  appDealPath,
  checkoutReturnUrl,
  parseCheckoutReturnTo,
} from "@/lib/deals/paths";

const DEAL_ID = "22222222-2222-4222-8222-222222222222";

describe("checkout return path", () => {
  it("accepts the app deal path used after verified Pro", () => {
    expect(parseCheckoutReturnTo(appDealPath(DEAL_ID))).toBe(
      `/app/deals/${DEAL_ID}`,
    );
    expect(parseCheckoutReturnTo("/deals/cloud-contact-centre-platform-opportunity")).toBe(
      "/deals/cloud-contact-centre-platform-opportunity",
    );
  });

  it("drops open redirects instead of falling back to /app", () => {
    expect(parseCheckoutReturnTo("https://evil.example")).toBeNull();
    expect(parseCheckoutReturnTo("//evil.example")).toBeNull();
    expect(parseCheckoutReturnTo("/admin")).toBeNull();
    expect(parseCheckoutReturnTo("/app/settings")).toBeNull();
  });

  it("appends next onto the configured Dodo return URL", () => {
    expect(
      checkoutReturnUrl(
        "http://localhost:3000/checkout/success",
        appDealPath(DEAL_ID),
      ),
    ).toBe(
      `http://localhost:3000/checkout/success?next=${encodeURIComponent(appDealPath(DEAL_ID))}`,
    );
  });
});
