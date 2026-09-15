import { describe, expect, it } from "vitest";

import { canEnableSource, sourceEnableBlockReason } from "@/lib/admin/source-enable";

describe("admin source enablement gates", () => {
  it("blocks UNKNOWN and PROHIBITED the same way the database trigger does", () => {
    expect(
      sourceEnableBlockReason({
        reuseStatus: "UNKNOWN",
        accessMethod: "OCDS_API",
        scrapingPermitted: false,
      }),
    ).toBe("source cannot be enabled with reuse status UNKNOWN");
    expect(
      sourceEnableBlockReason({
        reuseStatus: "PROHIBITED",
        accessMethod: "HTML",
        scrapingPermitted: true,
      }),
    ).toBe("source cannot be enabled with reuse status PROHIBITED");
  });

  it("blocks HTML/PDF discovery until scraping is permitted", () => {
    expect(
      canEnableSource({
        reuseStatus: "OPEN_LICENSE",
        accessMethod: "PDF_LINK_DISCOVERY",
        scrapingPermitted: false,
      }),
    ).toBe(false);
    expect(
      canEnableSource({
        reuseStatus: "TERMS_REVIEWED",
        accessMethod: "HTML",
        scrapingPermitted: true,
      }),
    ).toBe(true);
  });

  it("allows official API sources with an automatable reuse status", () => {
    expect(
      canEnableSource({
        reuseStatus: "OPEN_LICENSE",
        accessMethod: "OCDS_API",
        scrapingPermitted: false,
      }),
    ).toBe(true);
  });
});
