import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  SIGNUP_PROMPT_DELAY_MS,
  accumulateVisibleTime,
  parseSignupPromptState,
  shouldOpenSignupPrompt,
} from "@/lib/conversion/signup-prompt";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("signup prompt timing", () => {
  it("opens only after one minute of visible time", () => {
    expect(SIGNUP_PROMPT_DELAY_MS).toBe(60_000);
    expect(
      shouldOpenSignupPrompt({ elapsedMs: 59_999, dismissed: false }),
    ).toBe(false);
    expect(
      shouldOpenSignupPrompt({ elapsedMs: 60_000, dismissed: false }),
    ).toBe(true);
    expect(
      shouldOpenSignupPrompt({ elapsedMs: 120_000, dismissed: true }),
    ).toBe(false);
  });

  it("accumulates only while the tab is visible", () => {
    const start = { elapsedMs: 1_000, dismissed: false };
    expect(accumulateVisibleTime(start, 5_000, false)).toEqual(start);
    expect(accumulateVisibleTime(start, 5_000, true)).toEqual({
      elapsedMs: 6_000,
      dismissed: false,
    });
    expect(
      accumulateVisibleTime({ elapsedMs: 10_000, dismissed: true }, 5_000, true),
    ).toEqual({ elapsedMs: 10_000, dismissed: true });
  });

  it("recovers from missing or malformed session state", () => {
    expect(parseSignupPromptState(null)).toEqual({
      elapsedMs: 0,
      dismissed: false,
    });
    expect(parseSignupPromptState("{not-json")).toEqual({
      elapsedMs: 0,
      dismissed: false,
    });
    expect(
      parseSignupPromptState(
        JSON.stringify({ elapsedMs: "60", dismissed: "yes" }),
      ),
    ).toEqual({ elapsedMs: 0, dismissed: false });
  });

  it("is wired for anonymous marketing visitors only", () => {
    expect(read("app/(marketing)/layout.tsx")).toContain(
      "<SignupPrompt enabled={!isAuthenticated} />",
    );
    expect(read("app/(auth)/layout.tsx")).not.toContain("SignupPrompt");
    expect(read("app/(app)/app/layout.tsx")).not.toContain("SignupPrompt");
    expect(read("app/(admin)/admin/layout.tsx")).not.toContain("SignupPrompt");
  });
});
