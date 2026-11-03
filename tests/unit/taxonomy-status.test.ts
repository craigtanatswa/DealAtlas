import { describe, expect, it } from "vitest";

import {
  buyerSectorFromClassifications,
  mapDealStatus,
} from "@/ingestion/normalizers/taxonomy";

const now = new Date("2026-10-08T00:00:00.000Z");

describe("mapDealStatus", () => {
  it("marks a tender with a future deadline OPEN", () => {
    expect(
      mapDealStatus({
        tags: ["tender"],
        tenderStatus: "active",
        submissionDeadline: "2026-11-01T12:00:00.000Z",
        now,
        hasAwards: false,
      }),
    ).toBe("OPEN");
  });

  it("marks a tender update with a future deadline OPEN", () => {
    expect(
      mapDealStatus({
        tags: ["tenderUpdate"],
        tenderStatus: "active",
        submissionDeadline: "2026-12-01T12:00:00.000Z",
        now,
        hasAwards: false,
      }),
    ).toBe("OPEN");
  });

  it("marks a planning notice with a dated future tender UPCOMING", () => {
    expect(
      mapDealStatus({
        tags: ["planning"],
        tenderStatus: "planned",
        futureTenderDate: "2026-12-01T00:00:00.000Z",
        now,
        hasAwards: false,
      }),
    ).toBe("UPCOMING");
  });

  it("marks an unknown notice UNCLASSIFIED", () => {
    expect(
      mapDealStatus({
        tags: ["compiled"],
        tenderStatus: "pending",
        now,
        hasAwards: false,
      }),
    ).toBe("UNCLASSIFIED");
  });

  it("marks a past tender deadline CLOSED", () => {
    expect(
      mapDealStatus({
        tags: ["tender"],
        tenderStatus: "active",
        submissionDeadline: "2026-09-01T12:00:00.000Z",
        now,
        hasAwards: false,
      }),
    ).toBe("CLOSED");
  });

  it("maps an active tender with no deadline to OPEN", () => {
    expect(
      mapDealStatus({
        tags: ["tenderAmendment"],
        tenderStatus: "active",
        submissionDeadline: null,
        now,
        hasAwards: false,
      }),
    ).toBe("OPEN");
  });

  it("marks a tender with no deadline and no status UNCLASSIFIED", () => {
    expect(
      mapDealStatus({
        tags: ["tender"],
        tenderStatus: null,
        submissionDeadline: null,
        now,
        hasAwards: false,
      }),
    ).toBe("UNCLASSIFIED");
  });
});

describe("buyerSectorFromClassifications", () => {
  it("treats a private utility classification as PRIVATE before the regex checks", () => {
    expect(
      buyerSectorFromClassifications([
        { scheme: "UK_CA_TYPE", id: "privateUtility", description: "Private utility" },
      ]),
    ).toBe("PRIVATE");
    expect(
      buyerSectorFromClassifications([
        { scheme: "uk_ca_type", id: "PRIVATEUTILITY", description: null },
      ]),
    ).toBe("PRIVATE");
  });

  it("does not treat a public undertaking as private", () => {
    expect(
      buyerSectorFromClassifications([
        { scheme: "UK_CA_TYPE", id: "publicUndertaking", description: "Public undertaking" },
      ]),
    ).toBe("PUBLIC");
  });

  it("keeps the existing healthcare and public classifications unchanged", () => {
    expect(
      buyerSectorFromClassifications([
        { scheme: "UK_CA_TYPE", id: "nhsBody", description: "NHS body" },
      ]),
    ).toBe("HEALTHCARE");
    expect(
      buyerSectorFromClassifications([
        { scheme: "UK_CA_TYPE", id: "publicAuthorityLocal", description: "Public authority - local" },
      ]),
    ).toBe("PUBLIC");
  });
});
