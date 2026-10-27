import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { IngestionError } from "@/ingestion/core/errors";
import { runIngestion } from "@/ingestion/core/pipeline";
import { createTedAdapter } from "@/ingestion/sources/ted/adapter";
import {
  TED_ELIGIBILITY_FIELDS,
  TED_REQUEST_LIMIT,
  TED_REQUEST_WINDOW_MS,
  TED_SEARCH_API,
} from "@/ingestion/sources/ted/constants";
import { parseTedNotice, parseTedRaw } from "@/ingestion/sources/ted/parse";
import { buildTedExpertQuery } from "@/ingestion/sources/ted/query";
import { tedSourceRecord } from "@/ingestion/sources/ted/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import { runOpenTedIngest } from "@/lib/jobs/ingest-open";
import { toPublicDealPreview } from "@/lib/search/dto";

const NOW = new Date("2026-10-14T12:00:00.000Z");

const PROTECTED = [
  "Canary Municipal Works",
  "999111-2026",
  "REF-CANARY-42",
  "buyer@canary-buyer.example",
  "+468000000",
  "https://documents.example/canary-spec.pdf",
  "https://ted.europa.eu/en/notice/-/detail/999111-2026",
  "https://canary-buyer.example/apply",
  "Stockholm",
];

function readOpenNotice(): Record<string, unknown> {
  const page = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/ingestion/ted/open.json"),
      "utf8",
    ),
  ) as { notices: Record<string, unknown>[] };
  return page.notices[0] ?? {};
}

function searchPage(notices: unknown[], token?: string) {
  return {
    notices,
    totalNoticeCount: notices.length,
    iterationNextToken: token,
  };
}

describe("TED expert query", () => {
  it("uses the UK SME filter fields and leaves award notices out", () => {
    const query = buildTedExpertQuery({
      publishedFrom: "20261007",
      publishedTo: "20261014",
      deadlineOn: "20261014",
    });
    for (const field of TED_ELIGIBILITY_FIELDS) {
      expect(query).toContain(field);
    }
    expect(query).toContain("publication-date >= 20261007");
    expect(query).toContain("submission-language = ENG");
    expect(query).toContain("deadline-receipt-request >= 20261014");
    expect(query).toContain("cn-standard");
    expect(query).toContain("cn-desg");
    expect(query).toContain("anyw-eea");
    expect(query).not.toContain("can-standard");
    expect(query).not.toContain("neg-wo-call");
    expect(query).not.toContain("GBR");
    expect(TED_REQUEST_LIMIT).toBeLessThanOrEqual(10);
    expect(TED_REQUEST_WINDOW_MS).toBeGreaterThanOrEqual(60_000);
  });
});

describe("TED notice parse", () => {
  it("keeps an open English-language competition and drops a past deadline", () => {
    const [candidate] = parseTedRaw({ notice: readOpenNotice() }, NOW);
    expect(candidate?.status).toBe("OPEN");
    expect(candidate?.sourceKey).toBe("ted");
    expect(candidate?.buyerSector).toBe("PUBLIC");
    expect(candidate?.currency).toBe("SEK");
    expect(candidate?.organizations[0]?.name).toBe("Canary Municipal Works");
    expect(candidate?.organizations[0]?.countryCode).toBe("SE");
    expect(candidate?.documents).toHaveLength(1);
    expect(candidate?.exactLocationText).toBe("Sweden");
    expect(candidate?.reference).toBe("REF-CANARY-42");

    const closed = {
      ...readOpenNotice(),
      "deadline-receipt-request": ["2026-10-01T00:00:00Z"],
    };
    expect(parseTedNotice(closed, NOW)).toBeNull();
  });

  it("accepts odd optional shapes and still rejects a missing title", () => {
    const notice = {
      ...readOpenNotice(),
      "buyer-name": "Canary Municipal Works",
      "estimated-value-proc": 2500000,
      "estimated-value-cur-proc": "EUR",
      "description-lot": null,
      "document-url-lot": ["notaurl"],
      "organisation-email-buyer": { unexpected: true },
      extra: { ignored: "shape" },
    };
    const [candidate] = parseTedRaw(notice, NOW);
    expect(candidate?.currency).toBe("EUR");
    expect(candidate?.documents).toHaveLength(0);
    expect(candidate?.organizations[0]?.email).toBeNull();

    expect(() =>
      parseTedNotice({ ...readOpenNotice(), "notice-title": { fra: "" } }, NOW),
    ).toThrow(IngestionError);
  });
});

describe("TED fixture ingestion", () => {
  it("stores one preserve-only deal and the public preview carries no source identity", async () => {
    const store = createMemoryIngestionStore({
      sources: [tedSourceRecord({ id: "source-ted" })],
    });
    const notice = readOpenNotice();
    const bad = { ...notice, "publication-number": "999222-2026", "notice-title": null };
    const adapter = createTedAdapter({
      now: () => NOW,
      http: {
        async getJson() {
          throw new Error("TED search is POST");
        },
        async postJson(url) {
          expect(url).toBe(TED_SEARCH_API);
          return {
            url,
            status: 200,
            contentType: "application/json",
            body: searchPage([notice, { "buyer-name": "skipped" }, bad]),
            rawText: "{}",
          };
        },
      },
    });
    const result = await runIngestion({
      sourceKey: "ted",
      store,
      adapter,
      now: NOW,
      limit: 5,
      triggerType: "TEST",
      updatedFrom: "2026-10-07T00:00:00",
      updatedTo: "2026-10-14T00:00:00",
    });

    expect(result.counters.new).toBe(1);
    expect(result.counters.errorCount).toBe(1);
    expect(result.errors.some((error) => error.stage === "parse")).toBe(true);
    expect(result.status).toBe("PARTIAL");
    expect(store.deals).toHaveLength(1);
    expect(store.previews).toHaveLength(1);
    expect(store.previews[0]?.isPublished).toBe(false);

    const preview = store.previews[0];
    expect(preview).toBeTruthy();
    const dto = toPublicDealPreview({
      slug: preview!.slug,
      preview_title: preview!.previewTitle,
      preview_summary: preview!.previewSummary,
      deal_type: preview!.dealType,
      buyer_sector: preview!.buyerSector,
      stage: preview!.stage,
      status: preview!.status,
      main_category: preview!.mainCategory,
      broad_region: preview!.broadRegion,
      value_band: preview!.valueBand,
      deadline_band: preview!.deadlineBand,
      duration_band: preview!.durationBand,
      sme_suitability: preview!.smeSuitability,
      bid_complexity: preview!.bidComplexity,
      competition_level: preview!.competitionLevel,
      requirements_preview: preview!.requirementsPreview,
      relevance_tags: preview!.relevanceTags,
      freshness_label: preview!.freshnessLabel,
    });
    const json = JSON.stringify(dto);
    for (const marker of PROTECTED) {
      expect(json).not.toContain(marker);
    }
    expect("documents" in dto).toBe(false);
    expect("sourceUrl" in dto).toBe(false);
    expect("buyerName" in dto).toBe(false);
    expect("reference" in dto).toBe(false);
    expect("ocid" in dto).toBe(false);
  });

  it("records a fetch failure as PARTIAL so the step can fail without publishing", async () => {
    const result = await runOpenTedIngest({
      store: createMemoryIngestionStore({
        sources: [tedSourceRecord({ id: "source-ted" })],
      }),
      now: NOW,
      dryRun: true,
      backfillDays: 7,
      sleep: async () => {},
      http: {
        async getJson() {
          throw new Error("unused");
        },
        async postJson() {
          throw new IngestionError({
            message: "HTTP 503 from api.ted.europa.eu",
            stage: "fetch",
            code: "HTTP_503",
            retryable: false,
          });
        },
      },
    });
    expect(result.status).toBe("PARTIAL");
    expect(result.counts.failed).toBe(1);
    expect(result.errors[0]?.stage).toBe("fetch");
    expect(result.changedDealIds).toEqual([]);
  });
});
