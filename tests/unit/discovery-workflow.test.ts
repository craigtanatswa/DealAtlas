import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

describe("private discovery workflow", () => {
  it("is manual only, offers discover/expiry/health and has no schedule", () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, ".github/workflows/discovery.yml"),
      "utf8",
    );

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s*schedule:/m);
    expect(workflow).not.toContain("cron:");
    expect(workflow).toContain("inputs.job");
    for (const job of ["discover", "expiry", "health"]) {
      expect(workflow).toContain(`- ${job}`);
    }
  });

  it("does not add discovery jobs to the scheduled workflow", () => {
    const scheduled = fs.readFileSync(
      path.join(ROOT, ".github/workflows/scheduled-jobs.yml"),
      "utf8",
    );
    expect(scheduled).not.toContain("discover");
    expect(scheduled).not.toContain("expiry");
    expect(scheduled).not.toContain("health");
  });
});
