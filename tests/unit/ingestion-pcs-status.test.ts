import { describe, expect, it } from "vitest";

import { mapPublicContractsScotlandStatus } from "@/ingestion/sources/public-contracts-scotland/status";
import { parsePublicContractsScotlandRaw } from "@/ingestion/sources/public-contracts-scotland/parse";

const NOW = new Date("2026-11-04T09:30:00.000Z");

function map(overrides: Partial<Parameters<typeof mapPublicContractsScotlandStatus>[0]> = {}) {
  return mapPublicContractsScotlandStatus({
    now: NOW,
    ...overrides,
  });
}

function release(overrides: {
  tag: string[];
  tenderStatus?: string;
  deadline?: string;
  futureNoticeDate?: string;
  awards?: unknown[];
  contracts?: unknown[];
  documentType?: string;
}) {
  return {
    ocid: "ocds-r6ebe6-pcs-status",
    id: "rls-pcs-status",
    date: "2026-10-01T09:00:00Z",
    tag: overrides.tag,
    initiationType: "tender",
    tender: {
      id: "PCS-STATUS-1",
      title: "Synthetic PCS status fixture",
      description: "Synthetic fixture.",
      status: overrides.tenderStatus,
      tenderPeriod: overrides.deadline ? { endDate: overrides.deadline } : undefined,
      communication:
        overrides.futureNoticeDate === undefined
          ? undefined
          : { futureNoticeDate: overrides.futureNoticeDate },
      documents: overrides.documentType
        ? [{ id: "doc-1", documentType: overrides.documentType, url: "https://example.test/doc" }]
        : undefined,
    },
    awards: overrides.awards,
    contracts: overrides.contracts,
    parties: [
      {
        id: "GB-PPON-PCS-STATUS",
        name: "Synthetic PCS Council",
        identifier: { scheme: "GB-PPON", id: "PCS-STATUS" },
        roles: ["buyer"],
      },
    ],
    buyer: { id: "GB-PPON-PCS-STATUS", name: "Synthetic PCS Council" },
  };
}

describe("Public Contracts Scotland status mapping", () => {
  it("maps active contract notices by deadline", () => {
    expect(
      map({
        tags: ["tender"],
        tenderStatus: "active",
        submissionDeadline: "2026-12-01T12:00:00Z",
      }),
    ).toBe("OPEN");
    expect(
      map({
        tags: ["tender"],
        tenderStatus: "active",
        submissionDeadline: "2026-11-06T12:00:00Z",
      }),
    ).toBe("CLOSING_SOON");
    expect(
      map({
        tags: ["tender"],
        tenderStatus: "active",
        submissionDeadline: "2026-10-01T12:00:00Z",
      }),
    ).toBe("CLOSED");
    expect(
      map({ tags: ["tender"], tenderStatus: "active", submissionDeadline: null }),
    ).toBe("OPEN");
  });

  it("maps planned prior information notices even after the expected date", () => {
    expect(
      map({
        tags: ["planning"],
        tenderStatus: "planned",
        futureTenderDate: "2026-10-01T00:00:00Z",
      }),
    ).toBe("UPCOMING");
    expect(map({ tags: [], noticeType: 1 })).toBe("UPCOMING");
    expect(map({ tags: [], noticeType: 101 })).toBe("UPCOMING");
  });

  it("maps contract notice types without a tender status", () => {
    expect(map({ tags: [], noticeType: 102 })).toBe("OPEN");
    expect(map({ tags: [], documentTypes: ["contractNotice"] })).toBe("OPEN");
  });

  it("maps closed, cancelled, complete, withdrawn and award values", () => {
    expect(map({ tags: ["tender"], tenderStatus: "cancelled" })).toBe("CANCELLED");
    expect(map({ tags: ["tender"], tenderStatus: "withdrawn" })).toBe("WITHDRAWN");
    expect(map({ tags: ["tender"], tenderStatus: "unsuccessful" })).toBe("CLOSED");
    expect(map({ tags: ["tender"], tenderStatus: "closed" })).toBe("CLOSED");
    expect(map({ tags: ["tender"], tenderStatus: "expired" })).toBe("EXPIRED");
    expect(map({ tags: ["award"], tenderStatus: "complete" })).toBe("AWARDED");
    expect(map({ tags: ["contract"], tenderStatus: "complete" })).toBe("CLOSED");
    expect(map({ tags: ["award"], noticeType: 104 })).toBe("AWARDED");
    expect(map({ tags: ["award", "contract"], tenderStatus: "cancelled" })).toBe(
      "CANCELLED",
    );
  });

  it("leaves unknown values unmapped", () => {
    expect(map({ tags: ["compiled"], tenderStatus: "pending" })).toBeNull();
    expect(map({ tags: [], noticeType: 999 })).toBeNull();
    expect(map({})).toBeNull();
  });

  it("uses the mapping when parsing a PCS release and keeps unknown values held", () => {
    const [planned] = parsePublicContractsScotlandRaw(
      release({
        tag: ["planning"],
        tenderStatus: "planned",
        futureNoticeDate: "2026-10-01T00:00:00Z",
      }),
      NOW,
    );
    expect(planned?.status).toBe("UPCOMING");

    const [awarded] = parsePublicContractsScotlandRaw(
      release({
        tag: ["award"],
        awards: [{ id: "award-1", title: "Award", status: "active" }],
      }),
      NOW,
    );
    expect(awarded?.status).toBe("AWARDED");

    const [unknown] = parsePublicContractsScotlandRaw(
      release({ tag: ["compiled"], tenderStatus: "pending" }),
      NOW,
    );
    expect(unknown?.status).toBe("UNCLASSIFIED");
  });
});
