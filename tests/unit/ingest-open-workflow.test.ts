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
    expect(workflow).toContain("type: string");
    expect(workflow).toContain('default: "7"');
    expect(workflow.match(/BACKFILL_DAYS="\$\{BACKFILL_DAYS%\.0\}"/g)).toHaveLength(5);
    expect(workflow).toContain("inputs.backfill_days || '7'");
    expect(workflow).toContain("inputs.dry_run || 'false'");
    expect(workflow).toContain('cron: "0 21 * * *"');
    expect(workflow).toContain('cron: "17 5 * * *"');
    expect(workflow).toContain('cron: "23 */6 * * *"');
    expect(workflow).toContain("publish_only:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain('".github/workflows/ingest-open.yml"');
    expect(workflow).toContain('"lib/jobs/**"');
    expect(workflow).toContain("environment: ingest");
    expect(workflow).toContain("timeout-minutes: 30");
    expect(workflow).toContain("group: dealatlas-ingest-open");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("npm run ingest-open");
    expect(workflow).toContain("id: build");
    expect(workflow).toContain("--job unpublish-stale");
    expect(workflow).toContain("--job publish-eligible");
    expect(workflow).toContain("--job publish-alert");
    expect(workflow).toContain("npm run ingest-alert");
    expect(workflow).not.toContain("unpublish-expired");
    expect(workflow).not.toContain("--job ingest");
    const scheduled = fs.readFileSync(
      path.join(ROOT, ".github/workflows/scheduled-jobs.yml"),
      "utf8",
    );
    expect(scheduled).toContain("workflow_dispatch:");
    expect(scheduled).not.toContain("ingest-open");
  });

  it("puts database env on the job and Resend only on the alert step", () => {
    const ingestJob = workflow.slice(workflow.indexOf("  ingest:"), workflow.indexOf("  unpublish:"));
    const unpublishJob = workflow.slice(
      workflow.indexOf("  unpublish:"),
      workflow.indexOf("  publish:"),
    );
    expect(ingestJob.indexOf("SUPABASE_SECRET_KEY")).toBeLessThan(ingestJob.indexOf("steps:"));
    expect(unpublishJob.indexOf("SUPABASE_SECRET_KEY")).toBeLessThan(unpublishJob.indexOf("steps:"));
    const beforeAlerts = ingestJob.slice(0, ingestJob.indexOf("name: Unpublish stale previews"));
    expect(beforeAlerts).not.toContain("RESEND_API_KEY");
    expect(unpublishJob.slice(0, unpublishJob.indexOf("steps:"))).not.toContain("RESEND_API_KEY");
    expect(ingestJob).toContain("RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}");
    expect(ingestJob).toContain("LEAK_ALERT_EMAIL_TO: ${{ secrets.LEAK_ALERT_EMAIL_TO }}");
    expect(unpublishJob).toContain("if: failure()");
    const publishStep = ingestJob.slice(ingestJob.indexOf("id: publish"), ingestJob.indexOf("name: Publish alert"));
    expect(publishStep).toContain("steps.ingest.outcome == 'success' && steps.build.outcome == 'success'");
    expect(publishStep).not.toContain("steps.contracts_finder.outcome");
    expect(publishStep).not.toContain("public_contracts_scotland");
    expect(publishStep).not.toContain("sell2wales");
    expect(publishStep).not.toContain("gca_agreements");
    expect(publishStep).not.toContain("gca_pipeline");
    const buildStep = ingestJob.slice(ingestJob.indexOf("id: build"), ingestJob.indexOf("id: unpublish"));
    expect(buildStep).not.toContain("steps.contracts_finder.outcome");
    expect(buildStep).not.toContain("steps.gca_agreements.outcome");
    expect(buildStep).not.toContain("steps.gca_pipeline.outcome");
    const contractsFinderStep = ingestJob.slice(ingestJob.indexOf("id: contracts_finder"), ingestJob.indexOf("id: gca_agreements"));
    expect(contractsFinderStep).not.toContain("continue-on-error");
    expect(ingestJob.match(/continue-on-error: true/g)).toHaveLength(3);
    expect(ingestJob.indexOf("id: ingest")).toBeLessThan(ingestJob.indexOf("id: contracts_finder"));
    expect(ingestJob.indexOf("id: contracts_finder")).toBeLessThan(
      ingestJob.indexOf("id: public_contracts_scotland"),
    );
    expect(ingestJob.indexOf("id: public_contracts_scotland")).toBeLessThan(
      ingestJob.indexOf("id: sell2wales"),
    );
    expect(ingestJob.indexOf("id: sell2wales")).toBeLessThan(
      ingestJob.indexOf("id: gca_agreements"),
    );
    expect(ingestJob.indexOf("id: gca_agreements")).toBeLessThan(ingestJob.indexOf("id: gca_pipeline"));
    expect(ingestJob.indexOf("id: gca_pipeline")).toBeLessThan(ingestJob.indexOf("id: build"));
    expect(ingestJob.indexOf("id: contracts_finder")).toBeLessThan(ingestJob.indexOf("id: find_a_grant"));
    expect(ingestJob.indexOf("id: find_a_grant")).toBeLessThan(ingestJob.indexOf("id: innovate_uk"));
    expect(ingestJob.indexOf("id: innovate_uk")).toBeLessThan(ingestJob.indexOf("id: ted"));
    expect(ingestJob.indexOf("id: ted")).toBeLessThan(ingestJob.indexOf("id: build"));
    expect(ingestJob).toContain("OPEN_INGEST_SOURCE: contracts-finder");
    expect(ingestJob).toContain("OPEN_INGEST_SOURCE: public-contracts-scotland");
    expect(ingestJob).toContain("OPEN_INGEST_SOURCE: sell2wales");
    expect(ingestJob).toContain("OPEN_INGEST_SOURCE: gca-agreements");
    expect(ingestJob).toContain("OPEN_INGEST_SOURCE: gca-procurement-pipeline");
    expect(ingestJob).toContain("OPEN_INGEST_SOURCE: find-a-grant");
    expect(ingestJob).toContain("OPEN_INGEST_SOURCE: innovate-uk");
    expect(ingestJob).toContain("OPEN_INGEST_SOURCE: ted");
    expect(ingestJob).not.toContain("nhs-supply-chain");
    expect(ingestJob).not.toContain("nhs-sbs");
    expect(publishStep).not.toContain("steps.find_a_grant.outcome");
    expect(publishStep).not.toContain("steps.innovate_uk.outcome");
    expect(ingestJob).toContain("CONTRACTS_FINDER_OK: ${{ steps.contracts_finder.outcome == 'success' && '1' || '0' }}");
    expect(ingestJob).toContain("GCA_AGREEMENTS_OK: ${{ steps.gca_agreements.outcome == 'success' && '1' || '0' }}");
    expect(ingestJob).toContain("GCA_PIPELINE_OK: ${{ steps.gca_pipeline.outcome == 'success' && '1' || '0' }}");
    expect(ingestJob).toContain("TED_OK: ${{ steps.ted.outcome == 'success' && '1' || '0' }}");
    expect(publishStep).not.toContain("steps.ted");
    const tedStep = ingestJob.slice(ingestJob.indexOf("id: ted"), ingestJob.indexOf("id: build"));
    expect(tedStep).toContain("continue-on-error: true");
    expect(unpublishJob).not.toContain("ingest-open");
    expect(unpublishJob).not.toContain("Build previews");
    expect(unpublishJob).toContain('github.event.schedule == \'17 5 * * *\'');
    const publishJob = workflow.slice(workflow.indexOf("  publish:"));
    expect(ingestJob).toContain("inputs.publish_only != true");
    expect(ingestJob).toContain("github.event.schedule == '0 21 * * *'");
    expect(ingestJob).not.toContain("github.event_name == 'push'");
    expect(publishJob).toContain("github.event_name == 'push'");
    expect(publishJob).toContain("inputs.publish_only == true");
    expect(publishJob).toContain("github.event.schedule == '23 */6 * * *'");
    expect(publishJob).toContain("environment: ingest");
    expect(publishJob).toContain("OPEN_INGEST_PHASE: previews");
    expect(publishJob).not.toContain("OPEN_INGEST_PHASE: ingest");
    expect(publishJob).not.toContain("Build previews");
    expect(publishJob.indexOf("npm run ingest-open")).toBeLessThan(
      publishJob.indexOf("--job unpublish-stale"),
    );
    expect(publishJob.indexOf("--job unpublish-stale")).toBeLessThan(
      publishJob.indexOf("--job publish-eligible"),
    );
    expect(publishJob.indexOf("--job publish-eligible")).toBeLessThan(
      publishJob.lastIndexOf("--job publish-alert"),
    );
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
      if (name.startsWith("0023_")) {
        expect(sql).toContain("'contracts-finder'");
        continue;
      }
      if (name.startsWith("0045_")) {
        expect(sql).toContain("'public-contracts-scotland'");
        expect(sql).toContain("'sell2wales'");
        expect(sql).toMatch(/'OPEN_LICENSE',\n\s*false,\n\s*false,/);
        continue;
      }
      expect(sql).not.toMatch(/insert into public\.data_sources[\s\S]{0,800}contracts-finder/i);
    }
    const endpoint = fs.readFileSync(path.join(migrations, "0008_find_a_tender_ocds.sql"), "utf8");
    expect(endpoint).toContain("source_key = 'find-a-tender'");
    expect(endpoint).not.toMatch(/reuse_status|access_method|enabled/);
  });
  it("keeps a TED fetch failure from blocking Find a Tender publish", () => {
    const ingestJob = workflow.slice(workflow.indexOf("  ingest:"), workflow.indexOf("  unpublish:"));
    const ted = ingestJob.slice(ingestJob.indexOf("id: ted"), ingestJob.indexOf("id: build"));
    const publishStep = ingestJob.slice(
      ingestJob.indexOf("id: publish"),
      ingestJob.indexOf("name: Publish alert"),
    );
    expect(ted).toContain("continue-on-error: true");
    expect(ted).toContain("OPEN_INGEST_SOURCE: ted");
    expect(ingestJob.indexOf("id: contracts_finder")).toBeLessThan(ingestJob.indexOf("id: ted"));
    expect(publishStep).toContain("steps.ingest.outcome == 'success' && steps.build.outcome == 'success'");
    expect(publishStep).not.toContain("steps.ted");
    expect(publishStep).not.toContain("steps.contracts_finder.outcome");
    const scheduled = fs.readFileSync(
      path.join(ROOT, ".github/workflows/scheduled-jobs.yml"),
      "utf8",
    );
    expect(scheduled).not.toContain("api.ted.europa.eu");
    expect(scheduled).not.toContain("OPEN_INGEST_SOURCE: ted");
  });

});
