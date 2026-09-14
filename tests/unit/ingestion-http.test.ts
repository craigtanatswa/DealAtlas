import { describe, expect, it } from "vitest";

import { IngestionError } from "@/ingestion/core/errors";
import { assertAllowedUrl } from "@/ingestion/core/http";
import { FIND_A_TENDER_FETCH_POLICY } from "@/ingestion/sources/find-a-tender/constants";
import { NISTA_FETCH_POLICY } from "@/ingestion/sources/uk-infrastructure-pipeline/constants";

describe("Find a Tender fetch allowlist", () => {
  it("allows official OCDS API URLs", () => {
    const url = assertAllowedUrl(
      "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=1",
      FIND_A_TENDER_FETCH_POLICY,
    );
    expect(url.pathname).toBe("/api/1.0/ocdsReleasePackages");
  });

  it("refuses HTML notice pages and foreign hosts", () => {
    expect(() =>
      assertAllowedUrl(
        "https://www.find-tender.service.gov.uk/Notice/000001-2026",
        FIND_A_TENDER_FETCH_POLICY,
      ),
    ).toThrow(IngestionError);

    expect(() =>
      assertAllowedUrl("https://evil.example/api/1.0/ocdsReleasePackages", FIND_A_TENDER_FETCH_POLICY),
    ).toThrow(/host/);

    expect(() =>
      assertAllowedUrl(
        "http://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages",
        FIND_A_TENDER_FETCH_POLICY,
      ),
    ).toThrow(/https:/);
  });

  it("allows the official NISTA dashboard JSON layout and refuses HTML pages", () => {
    const url = assertAllowedUrl(
      "https://pipeline.nista.grid.civilservice.gov.uk/_dash-layout",
      NISTA_FETCH_POLICY,
    );
    expect(url.pathname).toBe("/_dash-layout");

    expect(() =>
      assertAllowedUrl(
        "https://pipeline.nista.grid.civilservice.gov.uk/",
        NISTA_FETCH_POLICY,
      ),
    ).toThrow(/path/);
  });
});
