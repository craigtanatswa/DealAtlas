import { describe, expect, it } from "vitest";

import {
  deadlineBandFromDeadline,
  durationBandFromDates,
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
