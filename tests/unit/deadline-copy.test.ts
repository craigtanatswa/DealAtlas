import { describe, expect, it } from "vitest";

import { deadlineCopy } from "@/lib/deals/deadline-copy";

const NOW = new Date("2026-10-06T12:00:00.000Z");

describe("deadline copy", () => {
  it("formats a known closing deadline in Europe/London without inventing a day", () => {
    const soon = deadlineCopy({
      status: "CLOSING_SOON",
      deadline: "2026-10-09T16:00:00.000Z",
      now: NOW,
    });
    expect(soon.text).toBe("Closes in 3 days · 9 Oct");
    expect(soon.datetime).toBe("2026-10-09T16:00:00.000Z");
    expect(soon.keyFact).toEqual({ label: "Closing date", value: "9 October 2026" });

    expect(
      deadlineCopy({
        status: "CLOSING_SOON",
        deadline: "2026-10-06T18:00:00.000Z",
        now: NOW,
      }).text,
    ).toBe("Closes today");
    expect(
      deadlineCopy({
        status: "CLOSING_SOON",
        deadline: "2026-10-07T10:00:00.000Z",
        now: NOW,
      }).text,
    ).toBe("Closes tomorrow");
    expect(
      deadlineCopy({
        status: "OPEN",
        deadline: "2027-01-09T12:00:00.000Z",
        now: NOW,
      }).text,
    ).toBe("Closes 9 Jan 2027");
  });

  it("shows Deadline TBC when an open preview has no deadline", () => {
    const copy = deadlineCopy({ status: "OPEN", deadline: null, deadlineBand: null, now: NOW });
    expect(copy.text).toBe("Deadline TBC");
    expect(copy.datetime).toBeNull();
    expect(copy.keyFact).toEqual({ label: "Deadline", value: "Deadline TBC" });
    expect(JSON.stringify(copy)).not.toMatch(/http|@|ocds|reference/i);
  });

  it("uses a preview band on public pages and does not invent a calendar date", () => {
    const open = deadlineCopy({ status: "OPEN", deadlineBand: "Within 14 days", now: NOW });
    expect(open.text).toBe("Closes within 14 days");
    expect(open.datetime).toBeNull();
    expect(open.keyFact).toEqual({ label: "Closing window", value: "Within 14 days" });

    const upcoming = deadlineCopy({
      status: "UPCOMING",
      deadlineBand: "Upcoming / date not yet fixed",
      now: NOW,
    });
    expect(upcoming.text).toBe("Opening date not yet announced");
    expect(upcoming.datetime).toBeNull();
    expect(upcoming.keyFact?.value).toBe("Not yet announced");
  });

  it("names an upcoming window only when a start and end are known", () => {
    const range = deadlineCopy({
      status: "UPCOMING",
      expectedStart: "2026-11-01T00:00:00.000Z",
      expectedEnd: "2026-12-15T00:00:00.000Z",
      now: NOW,
    });
    expect(range.text).toBe("Expected Nov–Dec 2026");
    expect(range.datetime).toBeNull();
    expect(
      deadlineCopy({
        status: "UPCOMING",
        expectedStart: "2026-11-04T00:00:00.000Z",
        now: NOW,
      }).text,
    ).toBe("Expected to open November 2026");
  });
});
