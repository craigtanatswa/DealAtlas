import { describe, expect, it } from "vitest";

import { redactLogValue } from "@/lib/observability/log";
import { parseSentryDsn, createErrorReporter } from "@/lib/monitoring";
import { isSourceDue, isSourceStale, parseCronExpression } from "@/lib/jobs/schedule";
import { parseJobArgs } from "@/lib/jobs/cli";
import { runIsolated } from "@/lib/jobs/isolate";
import { runScheduledIngestion } from "@/lib/jobs/ingest";
import { rebuildChangedPreviews } from "@/lib/jobs/previews";
import { runDataQualityChecks } from "@/lib/jobs/quality";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import { ukInfrastructurePipelineSourceRecord } from "@/ingestion/sources/uk-infrastructure-pipeline/seed";
import type { SourceAdapter } from "@/ingestion/core/types";

describe("structured logs", () => {
  it("redacts secrets and email addresses", () => {
    const redacted = redactLogValue({
      RESEND_API_KEY: "re_live_secret",
      to: "buyer@example.com",
      ok: true,
    }) as Record<string, unknown>;
    expect(redacted.RESEND_API_KEY).toBe("[redacted]");
    expect(redacted.to).toBe("b***@example.com");
    expect(redacted.ok).toBe(true);
  });
});

describe("monitoring abstraction", () => {
  it("parses a Sentry DSN and stays quiet when unset", async () => {
    const parsed = parseSentryDsn("https://abc123def456@o1.ingest.sentry.io/99");
    expect(parsed?.projectId).toBe("99");
    expect(parsed?.envelopeUrl).toContain("/api/99/envelope/");
    const reporter = createErrorReporter({ dsn: null });
    expect(reporter.configured).toBe(false);
    await reporter.captureException(new Error("boom"), { job: "ingest" });
  });
});

describe("source schedules", () => {
  it("marks a 6-hour source due after the next tick", () => {
    parseCronExpression("0 */6 * * *");
    const now = new Date("2026-09-15T12:30:00.000Z");
    expect(
      isSourceDue({
        scheduleExpression: "0 */6 * * *",
        lastSuccessAt: "2026-09-15T06:05:00.000Z",
        now,
      }),
    ).toBe(true);
    expect(
      isSourceDue({
        scheduleExpression: "0 */6 * * *",
        lastSuccessAt: "2026-09-15T12:05:00.000Z",
        now,
      }),
    ).toBe(false);
  });

  it("treats a missed daily source as stale", () => {
    expect(
      isSourceStale({
        enabled: true,
        scheduleExpression: "0 6 * * *",
        lastSuccessAt: "2026-09-10T06:00:00.000Z",
        now: new Date("2026-09-15T08:00:00.000Z"),
      }),
    ).toBe(true);
  });
});

describe("job CLI", () => {
  it("parses test mode as a safe smoke run", () => {
    const args = parseJobArgs(["--job", "ingest", "--mode", "test", "--due"]);
    expect(args.job).toBe("ingest");
    expect(args.mode).toBe("test");
    expect(args.smoke).toBe(true);
    expect(args.due).toBe(true);
  });
});

describe("source failure isolation", () => {
  it("continues remaining sources when one adapter fails", async () => {
    const ok: SourceAdapter = {
      sourceKey: "find-a-tender",
      async discover() {
        return { items: [] };
      },
      async fetch() {
        throw new Error("not used");
      },
      async parse() {
        return [];
      },
    };
    const failing: SourceAdapter = {
      sourceKey: "uk-infrastructure-pipeline",
      async discover() {
        throw new Error("source exploded");
      },
      async fetch() {
        throw new Error("not used");
      },
      async parse() {
        return [];
      },
    };
    const store = createMemoryIngestionStore({
      sources: [
        findATenderSourceRecord({ id: "source-fat" }),
        ukInfrastructurePipelineSourceRecord({ id: "source-nista" }),
      ],
    });
    const result = await runScheduledIngestion({
      store,
      mode: "live",
      force: true,
      all: true,
      adapters: {
        "find-a-tender": ok,
        "uk-infrastructure-pipeline": failing,
      },
      sleep: async () => undefined,
    });
    expect(result.status).toBe("PARTIAL");
    expect(result.results).toHaveLength(2);
    expect(result.results.some((item) => item.ok)).toBe(true);
    expect(result.results.some((item) => !item.ok)).toBe(true);
  });

  it("runs isolated tasks independently", async () => {
    const results = await runIsolated(
      [1, 2, 3],
      async (item) => {
        if (item === 2) {
          throw new Error("nope");
        }
        return item * 2;
      },
      (error) => (error instanceof Error ? error.message : String(error)),
    );
    expect(results.map((item) => item.ok)).toEqual([true, false, true]);
  });
});

describe("changed preview rebuild", () => {
  it("selects only material changes in dry-run", async () => {
    const store = createMemoryIngestionStore({
      sources: [findATenderSourceRecord({ id: "source-fat" })],
    });
    const deal = await store.createDeal({
      primarySourceId: "source-fat",
      externalPrimaryId: "n-1",
      ocid: "ocds-h6vhtk-1",
      reference: "REF-1",
      sourceTitle: "Managed IT support",
      sourceDescription: null,
      buyerOrganizationId: null,
      dealType: "PUBLIC_TENDER",
      buyerSector: "PUBLIC",
      stage: "LIVE",
      status: "OPEN",
      mainCategory: null,
      procurementMethod: null,
      specialRegime: null,
      currency: "GBP",
      valueMinExVat: null,
      valueMaxExVat: null,
      exactValueText: null,
      exactLocationText: null,
      enquiryDeadline: null,
      submissionDeadline: null,
      awardDecisionDate: null,
      contractStartDate: null,
      contractEndDate: null,
      extensionEndDate: null,
      nextProcurementDate: null,
      estimatedRenewalDate: null,
      smeSuitable: null,
      vcseSuitable: null,
      sourceUrl: null,
      applicationUrl: null,
      firstPublishedAt: null,
      latestSourceAt: null,
      lastVerifiedAt: null,
      dataQualityScore: null,
    });
    await store.insertDataChange({
      dealId: deal.id,
      sourceId: "source-fat",
      changeType: "deadline_change",
      fieldName: "submission_deadline",
      previousValue: null,
      newValue: "2026-10-01",
      material: true,
      occurredAt: "2026-09-15T10:00:00.000Z",
    });
    const result = await rebuildChangedPreviews({
      store,
      mode: "dry-run",
      changedSince: "2026-09-15T00:00:00.000Z",
    });
    expect(result.selected).toBe(1);
    expect(result.processed).toBe(0);
  });
});

describe("data quality checks", () => {
  it("reports a stale enabled source", async () => {
    const store = createMemoryIngestionStore({
      sources: [
        findATenderSourceRecord({
          id: "source-fat",
          lastSuccessAt: "2026-09-01T00:00:00.000Z",
        }),
      ],
    });
    const result = await runDataQualityChecks({
      store,
      now: new Date("2026-09-15T12:00:00.000Z"),
      mode: "test",
    });
    expect(result.staleSources.map((item) => item.sourceKey)).toContain("find-a-tender");
  });
});
