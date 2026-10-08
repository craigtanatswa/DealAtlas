import { describe, expect, it } from "vitest";

import { mapDealStatus } from "@/ingestion/normalizers/taxonomy";

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

  it("marks a tender with no deadline UNCLASSIFIED", () => {
    expect(
      mapDealStatus({
        tags: ["tenderAmendment"],
        tenderStatus: "active",
        submissionDeadline: null,
        now,
        hasAwards: false,
      }),
    ).toBe("UNCLASSIFIED");
  });
});
