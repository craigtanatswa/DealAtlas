import { describe, expect, it } from "vitest";

import { planLabel } from "@/lib/billing/display";

describe("plan labels", () => {
  it("names a founding member's annual plan as Pro annual", () => {
    expect(planLabel("PRO_ANNUAL", "ANNUAL", true)).toBe("Pro annual");
    expect(planLabel("PRO_ANNUAL", null, true)).toBe("Pro annual");
    expect(planLabel(null, "ANNUAL", true)).toBe("Pro annual");
    expect(planLabel("PRO_ANNUAL", "ANNUAL", true)).not.toMatch(/founding|£290|stay subscribed/i);
  });

  it("keeps the standard labels for everyone else", () => {
    expect(planLabel("PRO_ANNUAL", "ANNUAL", false)).toBe("Pro annual");
    expect(planLabel("PRO_ANNUAL", "ANNUAL")).toBe("Pro annual");
    expect(planLabel("PRO_MONTHLY", "MONTHLY", true)).toBe("Pro monthly");
    expect(planLabel(null, null, true)).toBe("Free");
  });
});
