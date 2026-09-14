import { describe, expect, it } from "vitest";

import { canIngestSource } from "@/ingestion/core/compliance";
import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";

describe("ingestion compliance gate", () => {
  it("allows the official Find a Tender OCDS source", () => {
    const source = findATenderSourceRecord();
    expect(canIngestSource(source)).toEqual({ allowed: true });
  });

  it("blocks UNKNOWN and PROHIBITED sources", () => {
    expect(
      canIngestSource(
        findATenderSourceRecord({
          sourceKey: "private-source-template",
          enabled: true,
          reuseStatus: "UNKNOWN",
          accessMethod: "HTML",
          scrapingPermitted: false,
        }),
      ).allowed,
    ).toBe(false);

    expect(
      canIngestSource(
        findATenderSourceRecord({
          sourceKey: "blocked",
          reuseStatus: "PROHIBITED",
        }),
      ).allowed,
    ).toBe(false);
  });

  it("blocks HTML sources unless scraping is permitted", () => {
    expect(
      canIngestSource(
        findATenderSourceRecord({
          sourceKey: "html-blocked",
          accessMethod: "HTML",
          reuseStatus: "TERMS_REVIEWED",
          scrapingPermitted: false,
        }),
      ).allowed,
    ).toBe(false);

    expect(
      canIngestSource(
        findATenderSourceRecord({
          sourceKey: "html-allowed",
          accessMethod: "HTML",
          reuseStatus: "TERMS_REVIEWED",
          scrapingPermitted: true,
        }),
      ),
    ).toEqual({ allowed: true });
  });

  it("blocks official APIs that have no licence or terms recorded", () => {
    expect(
      canIngestSource(
        findATenderSourceRecord({
          licenceName: null,
          licenceUrl: null,
          termsUrl: null,
        }),
      ).allowed,
    ).toBe(false);
  });

  it("does not allow a disabled source even with an open licence", () => {
    expect(
      canIngestSource(findATenderSourceRecord({ enabled: false })).allowed,
    ).toBe(false);
  });
});
