import { describe, expect, it } from "vitest";

import {
  DEADLINE_BANDS,
  deadlineBandFromDeadline,
  durationBandFromDates,
  rewriteClosingWindow,
  rewriteClosingWindowInRequirements,
  valueBandFromAmounts,
} from "@/lib/preview/bands";
import { broadRegionFromLocation } from "@/lib/preview/region";

describe("preview bands", () => {
  it("maps values into the documented bands including undisclosed", () => {
    expect(valueBandFromAmounts(null, null)).toBe("Undisclosed");
    expect(valueBandFromAmounts(10_000, null)).toBe("Under £25k");
    expect(valueBandFromAmounts(25_000, 40_000)).toBe("£25k–£50k");
    expect(valueBandFromAmounts(250_000, 250_000)).toBe("£250k–£500k");
    expect(valueBandFromAmounts(7_500_000, 7_500_000)).toBe("£5m–£10m");
    expect(valueBandFromAmounts(12_000_000, null)).toBe("£10m+");
  });

  it("maps deadlines relative to now", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    expect(deadlineBandFromDeadline(null, now, "OPEN")).toBe("Upcoming / date not yet fixed");
    expect(deadlineBandFromDeadline("2026-09-10T18:00:00.000Z", now)).toBe("Closing today");
    expect(deadlineBandFromDeadline("2026-09-12T12:00:00.000Z", now)).toBe("Within 3 days");
    expect(deadlineBandFromDeadline("2026-09-16T12:00:00.000Z", now)).toBe("Within 7 days");
    expect(deadlineBandFromDeadline("2026-09-22T12:00:00.000Z", now)).toBe("Within 14 days");
    expect(deadlineBandFromDeadline("2026-10-01T12:00:00.000Z", now)).toBe("Within 30 days");
    expect(deadlineBandFromDeadline("2026-12-01T12:00:00.000Z", now)).toBe("More than 30 days");
    expect(deadlineBandFromDeadline("2026-08-01T12:00:00.000Z", now)).toBe("Closed");
    expect(deadlineBandFromDeadline("2026-12-01T12:00:00.000Z", now, "AWARDED")).toBe("Closed");
  });

  it("derives every band and honours Europe/London calendar days", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    const day = (offset: number) =>
      new Date(now.getTime() + offset * 86_400_000).toISOString();

    expect(deadlineBandFromDeadline(day(0), now)).toBe("Closing today");
    expect(deadlineBandFromDeadline(day(1), now)).toBe("Within 3 days");
    expect(deadlineBandFromDeadline(day(3), now)).toBe("Within 3 days");
    expect(deadlineBandFromDeadline(day(4), now)).toBe("Within 7 days");
    expect(deadlineBandFromDeadline(day(7), now)).toBe("Within 7 days");
    expect(deadlineBandFromDeadline(day(8), now)).toBe("Within 14 days");
    expect(deadlineBandFromDeadline(day(14), now)).toBe("Within 14 days");
    expect(deadlineBandFromDeadline(day(15), now)).toBe("Within 30 days");
    expect(deadlineBandFromDeadline(day(30), now)).toBe("Within 30 days");
    expect(deadlineBandFromDeadline(day(31), now)).toBe("More than 30 days");
    expect(deadlineBandFromDeadline(null, now, "OPEN")).toBe(
      "Upcoming / date not yet fixed",
    );
    expect(deadlineBandFromDeadline(day(-1), now)).toBe("Closed");
    expect(deadlineBandFromDeadline(day(31), now, "CLOSED")).toBe("Closed");

    const bstNow = new Date("2026-07-01T23:30:00.000Z");
    expect(deadlineBandFromDeadline("2026-07-02T22:00:00.000Z", bstNow)).toBe(
      "Closing today",
    );
  });

  it("rewrites every known closing-window band", () => {
    for (const from of DEADLINE_BANDS) {
      for (const to of DEADLINE_BANDS) {
        expect(
          rewriteClosingWindow(`A buyer. Closing window ${from}. More text.`, to),
        ).toBe(`A buyer. Closing window ${to}. More text.`);
        expect(
          rewriteClosingWindowInRequirements(
            [`keyDates: Closing window ${from}. Contract term 1–2 years`],
            to,
          ),
        ).toEqual([`keyDates: Closing window ${to}. Contract term 1–2 years`]);
        expect(
          rewriteClosingWindowInRequirements([`keyDates: Closing window ${from}`], to),
        ).toEqual([`keyDates: Closing window ${to}`]);
      }
    }
  });

  it("rewrites only keyDates elements, preserves order and is idempotent", () => {
    const items = [
      "scope: Work for a public organisation.",
      "keyDates: Closing window Within 14 days. Contract term 1–2 years",
      "standards: ISO 27001",
      "keyDates: Closing window Within 30 days",
    ];
    const once = rewriteClosingWindowInRequirements(items, "Within 3 days");
    expect(once).toEqual([
      "scope: Work for a public organisation.",
      "keyDates: Closing window Within 3 days. Contract term 1–2 years",
      "standards: ISO 27001",
      "keyDates: Closing window Within 3 days",
    ]);
    expect(rewriteClosingWindowInRequirements(once, "Within 3 days")).toEqual(once);
    expect(rewriteClosingWindow(rewriteClosingWindow(items[1]!, "Within 7 days"), "Within 7 days"))
      .toBe("keyDates: Closing window Within 7 days. Contract term 1–2 years");
  });

  it("leaves unknown and differently-cased phrases alone", () => {
    expect(rewriteClosingWindow("Closing window Within 2 days", "Within 3 days")).toBe(
      "Closing window Within 2 days",
    );
    expect(rewriteClosingWindow("closing window Within 14 days", "Within 3 days")).toBe(
      "closing window Within 14 days",
    );
    expect(rewriteClosingWindow("No deadline phrase here", "Within 3 days")).toBe(
      "No deadline phrase here",
    );
  });

  it("maps contract duration", () => {
    expect(durationBandFromDates(null, null)).toBe("Not disclosed");
    expect(durationBandFromDates("2026-01-01", "2026-03-01")).toBe("Under 3 months");
    expect(durationBandFromDates("2026-01-01", "2027-01-01")).toBe("1–2 years");
    expect(durationBandFromDates("2026-01-01", "2032-01-01")).toBe("5+ years");
  });

  it("generalises locations to broad UK regions", () => {
    expect(broadRegionFromLocation(["Manchester", "UKD"])).toBe("North West England");
    expect(broadRegionFromLocation(["Manchester, United Kingdom"])).toBe("North West England");
    expect(broadRegionFromLocation(["Southwark, London"])).toBe("London");
    expect(broadRegionFromLocation(["M1 1AE"])).toBe("North West England");
    expect(broadRegionFromLocation(["nationwide UK"])).toBe("Nationwide");
    expect(broadRegionFromLocation(["remote working"])).toBe("Remote");
  });
});
