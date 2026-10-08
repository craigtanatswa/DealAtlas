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
    expect(workflow).toContain('cron: "17 5 * * *"');
    expect(workflow).toContain("environment: ingest");
    expect(workflow).toContain("timeout-minutes: 30");
    expect(workflow).toContain("group: dealatlas-ingest-open");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("npm run ingest-open");
    expect(workflow).toContain("npm run unpublish-expired");
    expect(workflow).toContain("npm run ingest-alert");
    expect(workflow).not.toContain("npm run job");
    const scheduled = fs.readFileSync(
      path.join(ROOT, ".github/workflows/scheduled-jobs.yml"),
      "utf8",
    );
    expect(scheduled).toContain("workflow_dispatch:");
    expect(scheduled).not.toContain("ingest-open");
  });

  it("puts database env on the job and Resend only on the alert step", () => {
    const ingestJob = workflow.slice(workflow.indexOf("  ingest:"), workflow.indexOf("  unpublish:"));
    const unpublishJob = workflow.slice(workflow.indexOf("  unpublish:"));
    expect(ingestJob.indexOf("SUPABASE_SECRET_KEY")).toBeLessThan(ingestJob.indexOf("steps:"));
    expect(unpublishJob.indexOf("SUPABASE_SECRET_KEY")).toBeLessThan(unpublishJob.indexOf("steps:"));
    expect(ingestJob.slice(0, ingestJob.indexOf("name: Alert"))).not.toContain("RESEND_API_KEY");
    expect(unpublishJob).not.toContain("RESEND_API_KEY");
    expect(ingestJob).toContain("RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}");
    expect(ingestJob).toContain("INGEST_ALERT_EMAIL_TO: ${{ secrets.INGEST_ALERT_EMAIL_TO }}");
    expect(unpublishJob).not.toContain("ingest-open");
    expect(unpublishJob).not.toContain("Build previews");
    expect(unpublishJob).toContain('github.event.schedule == \'17 5 * * *\'');
  });

  it("keeps the Find a Tender source on the publish rule", () => {
    const migrations = path.join(ROOT, "supabase/migrations");
    const seed = fs.readFileSync(path.join(migrations, "0006_seed_reference_data.sql"), "utf8");
    const row = seed.slice(seed.indexOf("'find-a-tender'"), seed.indexOf("private-source-template"));
    expect(row).toContain("'OCDS_API'");
    expect(row).toContain("'OPEN_LICENSE'");
    expect(row).toMatch(/'OPEN_LICENSE',\n\s*false,\n\s*true,/);
    const later = fs
      .readdirSync(migrations)
      .filter((name) => name.endsWith(".sql") && name > "0006");
    for (const name of later) {
      const sql = fs.readFileSync(path.join(migrations, name), "utf8");
      expect(sql).not.toMatch(/source_key\s*=\s*'contracts-finder'|'contracts-finder'/i);
    }
    const endpoint = fs.readFileSync(path.join(migrations, "0008_find_a_tender_ocds.sql"), "utf8");
    expect(endpoint).toContain("source_key = 'find-a-tender'");
    expect(endpoint).not.toMatch(/reuse_status|access_method|enabled/);
  });
});
