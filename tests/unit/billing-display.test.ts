import { describe, expect, it } from "vitest";

import { planLabel } from "@/lib/billing/display";

describe("plan labels", () => {
  it("names a founding member's annual plan instead of Pro annual", () => {
    expect(planLabel("PRO_ANNUAL", "ANNUAL", true)).toBe("Founding Pro — £290/yr for as long as you stay subscribed");
    expect(planLabel("PRO_ANNUAL", null, true)).toBe("Founding Pro — £290/yr for as long as you stay subscribed");
    expect(planLabel(null, "ANNUAL", true)).toBe("Founding Pro — £290/yr for as long as you stay subscribed");
  });

  it("keeps the standard labels for everyone else", () => {
    expect(planLabel("PRO_ANNUAL", "ANNUAL", false)).toBe("Pro annual");
    expect(planLabel("PRO_ANNUAL", "ANNUAL")).toBe("Pro annual");
    expect(planLabel("PRO_MONTHLY", "MONTHLY", true)).toBe("Pro monthly");
    expect(planLabel(null, null, true)).toBe("Free");
  });
});
