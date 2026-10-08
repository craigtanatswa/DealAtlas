import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/ingest-open.yml"), "utf8");

describe("ingest-open workflow", () => {
  it("dispatches Find a Tender only and leaves the scheduled workflow alone", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("dry_run:");
    expect(workflow).toContain("type: boolean");
    expect(workflow).toContain("default: true");
    expect(workflow).toContain("backfill_days:");
    expect(workflow).toContain("type: number");
    expect(workflow).toContain("default: 7");
    expect(workflow).toContain('cron: "41 4 */3 * *"');
    expect(workflow).toContain("environment: ingest");
    expect(workflow).toContain("timeout-minutes: 30");
    expect(workflow).toContain("group: dealatlas-ingest-open");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("npm run ingest-open");
    expect(workflow).not.toContain("npm run job");
    const scheduled = fs.readFileSync(
      path.join(ROOT, ".github/workflows/scheduled-jobs.yml"),
      "utf8",
    );
    expect(scheduled).toContain("workflow_dispatch:");
    expect(scheduled).not.toContain("ingest-open");
  });
});
