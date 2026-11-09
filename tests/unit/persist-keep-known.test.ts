import { describe, expect, it } from "vitest";

import { keepKnownStatusAndDeadline } from "@/ingestion/core/persist";
import type { DealRecord } from "@/ingestion/store/types";

type StatusAndDeadline = Pick<DealRecord, "status" | "submissionDeadline">;

const EXISTING: StatusAndDeadline = {
  status: "OPEN",
  submissionDeadline: "2026-10-01T12:00:00.000Z",
};

describe("keepKnownStatusAndDeadline", () => {
  it("keeps the existing deadline when the incoming deadline is null", () => {
    const result = keepKnownStatusAndDeadline(EXISTING, {
      status: "OPEN",
      submissionDeadline: null,
    });

    expect(result.submissionDeadline).toBe(EXISTING.submissionDeadline);
  });

  it("keeps a classified status when the incoming status is UNCLASSIFIED", () => {
    const result = keepKnownStatusAndDeadline(EXISTING, {
      status: "UNCLASSIFIED",
      submissionDeadline: "2026-11-01T12:00:00.000Z",
    });

    expect(result.status).toBe("OPEN");
    expect(result.submissionDeadline).toBe("2026-11-01T12:00:00.000Z");
  });

  it("lets an incoming CLOSED status override OPEN", () => {
    const result = keepKnownStatusAndDeadline(EXISTING, {
      status: "CLOSED",
      submissionDeadline: "2026-09-01T12:00:00.000Z",
    });

    expect(result.status).toBe("CLOSED");
    expect(result.submissionDeadline).toBe("2026-09-01T12:00:00.000Z");
  });

  it("keeps UNCLASSIFIED when both statuses are UNCLASSIFIED", () => {
    const result = keepKnownStatusAndDeadline(
      {
        status: "UNCLASSIFIED",
        submissionDeadline: null,
      },
      {
        status: "UNCLASSIFIED",
        submissionDeadline: null,
      },
    );

    expect(result).toEqual({
      status: "UNCLASSIFIED",
      submissionDeadline: null,
    });
  });
});
