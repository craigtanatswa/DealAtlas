import { describe, expect, it } from "vitest";

import { FIND_A_TENDER_RELEASE_API } from "@/ingestion/sources/find-a-tender/constants";
import { createFindATenderAdapter } from "@/ingestion/sources/find-a-tender/adapter";
import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import { openIngestLogLine, openIngestWindows, runOpenFindATenderIngest } from "@/lib/jobs/ingest-open";
import { unpublishExpiredDeals } from "@/lib/jobs/unpublish-expired";
import { isTemplatePreviewSlug } from "@/lib/deals/public-slug";
import { packageFromFixtures } from "@/tests/helpers/ingestion-fixtures";

const NOW = new Date("2026-09-10T12:00:00.000Z");

function store() {
  return createMemoryIngestionStore({
    sources: [findATenderSourceRecord({ id: "source-fat" })],
  });
}

function jsonResult(url: string, body: unknown) {
  return {
    url,
    status: 200,
    contentType: "application/json",
    body,
    rawText: "{}",
  };
}

describe("open Find a Tender ingest", () => {
  it("splits a backfill into seven-day windows", () => {
    expect(openIngestWindows(NOW, 7)).toHaveLength(1);
    expect(openIngestWindows(NOW, 8)).toHaveLength(2);
  });

  it("logs counts only", () => {
    const line = openIngestLogLine({
      fetched: 2,
      new: 1,
      updated: 0,
      unchanged: 1,
      failed: 0,
    });
    expect(JSON.parse(line)).toEqual({
      fetched: 2,
      new: 1,
      updated: 0,
      unchanged: 1,
      failed: 0,
    });
    expect(line).not.toMatch(/http|title|buyer|ocds|notice/i);
  });

  it("reads the release package once and does not fetch each notice", async () => {
    const urls: string[] = [];
    const memory = store();
    const result = await runOpenFindATenderIngest({
      store: memory,
      now: NOW,
      dryRun: false,
      backfillDays: 7,
      sleep: async () => {},
      http: {
        async getJson(url) {
          urls.push(url);
          return jsonResult(url, packageFromFixtures(["normal.json", "multi-lot.json"]));
        },
      },
    });

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/api/1.0/ocdsReleasePackages");
    expect(urls[0]).toContain("stages=tender");
    expect(urls[0]).not.toContain("/Notice/");
    expect(result.status).toBe("SUCCEEDED");
    expect(result.counts).toMatchObject({ fetched: 2, new: 2, updated: 0, failed: 0 });
    expect(memory.deals).toHaveLength(2);
    expect(memory.previews).toHaveLength(2);
    for (const preview of memory.previews) {
      expect(preview.isPublished).toBe(false);
      expect(isTemplatePreviewSlug(preview.slug, preview.previewTitle, preview.dealId)).toBe(true);
      const blob = `${preview.slug} ${preview.previewTitle} ${preview.previewSummary}`.toLowerCase();
      expect(blob).not.toContain("managed it");
      expect(blob).not.toContain("council");
      expect(blob).not.toContain("000001");
      expect(blob).not.toContain("ref-fixture");
      expect(blob).not.toContain("ocds-");
      expect(blob).not.toContain("find-tender");
    }
  });

  it("writes nothing on a re-run and treats zero new rows as success", async () => {
    const memory = store();
    const http = {
      async getJson(url: string) {
        return jsonResult(url, packageFromFixtures(["normal.json"]));
      },
    };
    await runOpenFindATenderIngest({
      store: memory,
      now: NOW,
      dryRun: false,
      backfillDays: 7,
      sleep: async () => {},
      http,
    });
    const deals = memory.deals.length;
    const raw = memory.rawRecords.length;
    const previews = memory.previews.length;
    const published = memory.previews.filter((preview) => preview.isPublished).length;

    const again = await runOpenFindATenderIngest({
      store: memory,
      now: NOW,
      dryRun: false,
      backfillDays: 7,
      sleep: async () => {},
      http,
    });

    expect(again.status).toBe("SUCCEEDED");
    expect(again.counts.new).toBe(0);
    expect(again.counts.unchanged).toBe(1);
    expect(memory.deals).toHaveLength(deals);
    expect(memory.rawRecords).toHaveLength(raw);
    expect(memory.previews).toHaveLength(previews);
    expect(memory.previews.filter((preview) => preview.isPublished)).toHaveLength(published);
  });

  it("dry_run counts without writing", async () => {
    const memory = store();
    const result = await runOpenFindATenderIngest({
      store: memory,
      now: NOW,
      dryRun: true,
      backfillDays: 7,
      sleep: async () => {},
      http: {
        async getJson(url) {
          return jsonResult(url, packageFromFixtures(["normal.json"]));
        },
      },
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.counts).toMatchObject({ fetched: 1, new: 1, failed: 0 });
    expect(memory.deals).toHaveLength(0);
    expect(memory.rawRecords).toHaveLength(0);
    expect(memory.previews).toHaveLength(0);
    expect(memory.runs).toHaveLength(0);
  });

  it("keeps existing rows when a later page fails", async () => {
    const memory = store();
    let calls = 0;
    const next = `${FIND_A_TENDER_RELEASE_API}?cursor=${encodeURIComponent("updatedFrom=2026-09-03T12:00:00|updatedTo=2026-09-10T12:00:00|nextCursor=2")}&updatedFrom=2026-09-03T12:00:00&updatedTo=2026-09-10T12:00:00`;
    const result = await runOpenFindATenderIngest({
      store: memory,
      now: NOW,
      dryRun: false,
      backfillDays: 7,
      sleep: async () => {},
      http: {
        async getJson(url) {
          calls += 1;
          if (calls > 1) {
            throw new Error("upstream unavailable");
          }
          return jsonResult(url, {
            ...(packageFromFixtures(["normal.json"]) as object),
            links: { next },
          });
        },
      },
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.counts.failed).toBeGreaterThan(0);
    expect(result.counts.new).toBe(1);
    expect(memory.deals).toHaveLength(1);
    expect(memory.deals[0]?.status).toBe("OPEN");
  });

  it("leaves is_published unchanged on existing rows", async () => {
    const memory = store();
    const original = packageFromFixtures(["normal.json", "multi-lot.json"]);
    const updated = structuredClone(original) as {
      releases: Array<{ tender: { description: string } }>;
    };
    updated.releases[0]!.tender.description += " revised scope";
    let calls = 0;
    const http = {
      async getJson(url: string) {
        calls += 1;
        return jsonResult(url, calls === 1 ? original : updated);
      },
    };
    await runOpenFindATenderIngest({
      store: memory,
      now: NOW,
      dryRun: false,
      backfillDays: 7,
      sleep: async () => {},
      http,
    });
    expect(memory.previews).toHaveLength(2);
    const [published, held] = memory.previews;
    published!.isPublished = true;
    held!.isPublished = false;
    const flags = new Map(memory.previews.map((preview) => [preview.dealId, preview.isPublished]));
    const dealCount = memory.deals.length;

    const again = await runOpenFindATenderIngest({
      store: memory,
      now: NOW,
      dryRun: false,
      backfillDays: 7,
      sleep: async () => {},
      http,
    });

    expect(again.status).toBe("SUCCEEDED");
    expect(again.counts.updated).toBeGreaterThan(0);
    expect(memory.deals).toHaveLength(dealCount);
    expect(memory.previews).toHaveLength(2);
    for (const preview of memory.previews) {
      expect(preview.isPublished).toBe(flags.get(preview.dealId));
    }
    expect(memory.previews.some((preview) => preview.isPublished)).toBe(true);
    expect(memory.previews.some((preview) => !preview.isPublished)).toBe(true);
  });

  it("unpublishes only previews whose deadline has passed", async () => {
    const memory = store();
    await runOpenFindATenderIngest({
      store: memory,
      now: NOW,
      dryRun: false,
      backfillDays: 7,
      sleep: async () => {},
      http: {
        async getJson(url) {
          return jsonResult(url, packageFromFixtures(["normal.json", "multi-lot.json"]));
        },
      },
    });
    expect(memory.deals.length).toBe(2);
    for (const preview of memory.previews) {
      preview.isPublished = true;
    }
    memory.deals[0]!.submissionDeadline = "2026-09-01T00:00:00.000Z";
    memory.deals[1]!.submissionDeadline = null;
    const deals = memory.deals.length;
    const previews = memory.previews.length;

    const expired = await unpublishExpiredDeals({ store: memory, now: NOW });
    expect(expired.unpublished).toBe(1);
    expect(memory.previews.find((preview) => preview.dealId === memory.deals[0]!.id)?.isPublished).toBe(
      false,
    );
    expect(memory.previews.find((preview) => preview.dealId === memory.deals[1]!.id)?.isPublished).toBe(
      true,
    );
    expect(memory.deals).toHaveLength(deals);
    expect(memory.previews).toHaveLength(previews);

    const again = await unpublishExpiredDeals({ store: memory, now: NOW });
    expect(again.unpublished).toBe(0);
    expect(memory.deals).toHaveLength(deals);
    expect(memory.previews).toHaveLength(previews);
  });

  it("does not fetch a source the compliance gate rejects", async () => {
    let calls = 0;
    const memory = createMemoryIngestionStore({
      sources: [
        findATenderSourceRecord({
          id: "source-fat",
          reuseStatus: "UNKNOWN",
        }),
      ],
    });
    const adapter = createFindATenderAdapter({
      http: {
        async getJson() {
          calls += 1;
          throw new Error("should not fetch");
        },
      },
      now: () => NOW,
    });
    const result = await runOpenFindATenderIngest({
      store: memory,
      now: NOW,
      dryRun: false,
      backfillDays: 7,
      sleep: async () => {},
      adapter,
    });

    expect(result.status).toBe("SKIPPED");
    expect(calls).toBe(0);
    expect(memory.deals).toHaveLength(0);
  });
});
