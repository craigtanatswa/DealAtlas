import fs from "node:fs";
import path from "node:path";
import { crc32 } from "node:zlib";

import { describe, expect, it } from "vitest";

import { IngestionError } from "@/ingestion/core/errors";
import { runIngestion } from "@/ingestion/core/pipeline";
import { openIngestShouldFail, runOpenCatalogueIngest } from "@/lib/jobs/ingest-open";
import { toPublicDealPreview } from "@/lib/search/dto";
import {
  GCA_AGREEMENTS_API,
  GCA_AGREEMENTS_SOURCE_KEY,
  GCA_PIPELINE_SOURCE_KEY,
  assertRobotsCleanFeedUrl,
} from "@/ingestion/sources/gca/constants";
import {
  createGcaAgreementsAdapter,
  mapGcaAgreement,
} from "@/ingestion/sources/gca/agreements";
import { textHasReferenceToken } from "@/ingestion/sources/gca/link";
import { createGcaPipelineAdapter, mapPipelineRow } from "@/ingestion/sources/gca/pipeline";
import {
  gcaAgreementsSourceRecord,
  gcaPipelineSourceRecord,
} from "@/ingestion/sources/gca/seed";
import { contractsFinderSourceRecord } from "@/ingestion/sources/contracts-finder/seed";
import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import { listRegisteredSourceKeys } from "@/ingestion/sources/registry";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import type { DealPreviewRecord, DealRecord } from "@/ingestion/store/types";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const ROOT = path.resolve(__dirname, "../..");

function zipText(name: string, text: string): Uint8Array {
  const data = Buffer.from(text);
  const checksum = crc32(data);
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(checksum >>> 0, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(checksum >>> 0, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  const centralOffset = local.length + nameBuf.length + data.length;
  central.writeUInt32LE(0, 42);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuf.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

function cell(value: string): string {
  return `<table:table-cell><text:p>${value}</text:p></table:table-cell>`;
}

function pipelineWorkbook(rows: string[][]): Uint8Array {
  const header = [
    "Reference number",
    "Commercial agreement title",
    "Short description",
    "Category",
    "Agreement type (Framework, Open Framework or Dynamic Market)",
    "Estimated agreement value (Inc VAT)",
    "Estimated procurement start date",
    "Planned procurement sourcing route (anticipated)",
    "Anticipated main cat CPV code",
    "Anticipated main spend CPV code",
    "Main contact",
    "Procurement Act 2023 Y/N",
    "Estimated contract commencement date",
  ];
  const body = [header, ...rows]
    .map((row) => `<table:table-row>${row.map(cell).join("")}</table:table-row>`)
    .join("");
  const xml = `<?xml version="1.0"?><office:document-content><table:table>${body}</table:table></office:document-content>`;
  return zipText("content.xml", xml);
}

function jsonClient(body: unknown, calls: { n: number }) {
  return {
    async getJson(url: string) {
      calls.n += 1;
      expect(url).toBe(GCA_AGREEMENTS_API);
      expect(new URL(url).search).toBe("");
      return {
        url,
        status: 200,
        contentType: "application/json",
        body,
        rawText: "{}",
      };
    },
  };
}

function publicPreviewText(preview: DealPreviewRecord): string {
  return JSON.stringify(
    toPublicDealPreview({
      slug: preview.slug,
      preview_title: preview.previewTitle,
      preview_summary: preview.previewSummary,
      deal_type: preview.dealType,
      buyer_sector: preview.buyerSector,
      stage: preview.stage,
      status: preview.status,
      main_category: preview.mainCategory,
      broad_region: preview.broadRegion,
      value_band: preview.valueBand,
      deadline_band: preview.deadlineBand,
      duration_band: preview.durationBand,
      sme_suitability: preview.smeSuitability,
      bid_complexity: preview.bidComplexity,
      competition_level: preview.competitionLevel,
      requirements_preview: preview.requirementsPreview,
      relevance_tags: preview.relevanceTags,
      freshness_label: preview.freshnessLabel,
    }),
  );
}

function portalDeal(input: {
  id: string;
  sourceId: string;
  title: string;
  reference: string;
}): DealRecord {
  return {
    id: input.id,
    primarySourceId: input.sourceId,
    externalPrimaryId: input.reference,
    ocid: `ocds-h6vhtk-${input.id}`,
    reference: input.reference,
    sourceTitle: input.title,
    sourceDescription: null,
    buyerOrganizationId: null,
    dealType: "PUBLIC_TENDER",
    buyerSector: "PUBLIC",
    stage: "LIVE",
    status: "OPEN",
    mainCategory: "Workforce",
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
    firstDiscoveredAt: NOW.toISOString(),
    lastVerifiedAt: null,
    dataQualityScore: null,
    sourceCount: 1,
    normalizedTitle: input.title.toLowerCase(),
  };
}

describe("Government Commercial Agency adapters", () => {
  it("rejects robots-disallowed feed queries and keeps the agreements URL clean", () => {
    expect(new URL(GCA_AGREEMENTS_API).search).toBe("");
    assertRobotsCleanFeedUrl(GCA_AGREEMENTS_API);
    expect(() => assertRobotsCleanFeedUrl(`${GCA_AGREEMENTS_API}?page=1`)).toThrow(IngestionError);
    expect(() => assertRobotsCleanFeedUrl(`${GCA_AGREEMENTS_API}?limit=100`)).toThrow(IngestionError);
    expect(() => assertRobotsCleanFeedUrl(`${GCA_AGREEMENTS_API}?status[]=Upcoming`)).toThrow(
      IngestionError,
    );
  });

  it("paces the agreements feed at 6 requests a minute", async () => {
    let clock = 1_700_000_000_000;
    const sleeps: number[] = [];
    const calls = { n: 0 };
    const adapter = createGcaAgreementsAdapter({
      now: () => new Date(clock),
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      http: {
        async getJson() {
          calls.n += 1;
          throw new IngestionError({
            message: "stop",
            stage: "discover",
            code: "STOP",
            retryable: false,
          });
        },
      },
    });
    for (let index = 0; index < 6; index += 1) {
      await adapter.discover(undefined, { limit: 1 }).catch(() => undefined);
    }
    expect(calls.n).toBe(6);
    expect(sleeps).toEqual([]);
    await adapter.discover(undefined, { limit: 1 }).catch(() => undefined);
    expect(calls.n).toBe(7);
    expect(sleeps[0]).toBeGreaterThan(0);
    expect(sleeps[0]).toBeLessThanOrEqual(60_000);
  });

  it("maps live, expired and upcoming agreements and continues after a bad row", async () => {
    const calls = { n: 0 };
    const payload = {
      meta: { total_results: 99, limit: 20, results: 3, page: 1 },
      results: [
        {
          rm_number: "RM6348",
          title: "Regional training places",
          summary: "<p>Adult skills places</p>",
          category: "Workforce",
          status: "Live",
          terms: "DPS",
          start_date: "2024-08-16",
          end_date: "2028-10-27",
          salesforce_id: "sf-secret",
          lots: [{ title: "Regional training places", description: "same" }],
        },
        {
          rm_number: "RM1001",
          title: "Expired estates agreement",
          category: "Estates",
          status: "Live",
          terms: "Framework",
          end_date: "2020-01-01",
        },
        {
          rm_number: "RM1002",
          status: "Future (Pipeline)",
          category: "Workforce",
        },
        { rm_number: "not-a-reference", title: "Skipped" },
      ],
    };
    const source = gcaAgreementsSourceRecord({ id: "gca-agreements", enabled: true });
    const store = createMemoryIngestionStore({ sources: [source] });
    const adapter = createGcaAgreementsAdapter({
      now: () => NOW,
      sleep: async () => undefined,
      http: jsonClient(payload, calls),
    });
    const outcome = await runIngestion({
      sourceKey: GCA_AGREEMENTS_SOURCE_KEY,
      store,
      adapter,
      now: NOW,
      limit: 20,
      pageSize: 20,
      triggerType: "TEST",
      failureMode: "partial",
    });

    expect(calls.n).toBe(1);
    expect(outcome.truncated).toBe(true);
    expect(outcome.status).toBe("PARTIAL");
    expect(outcome.counters.new).toBe(2);
    expect(outcome.counters.errorCount).toBe(1);
    const live = store.deals.find((deal) => deal.reference === "RM6348");
    expect(live?.status).toBe("OPEN");
    expect(live?.dealType).toBe("DYNAMIC_MARKET");
    expect(live?.valueMinExVat).toBeNull();
    expect(live?.sourceDescription).toBe("Adult skills places");
    expect(store.lots.filter((lot) => lot.dealId === live?.id)).toHaveLength(0);
    expect(JSON.stringify(live)).not.toContain("sf-secret");
    expect(store.deals.find((deal) => deal.reference === "RM1001")?.status).toBe("EXPIRED");
    const preview = store.previews.find((item) => item.dealId === live?.id);
    expect(preview?.isPublished).toBe(false);
    expect(preview?.leakageRisk).toBe("LOW");
    const free = publicPreviewText(preview!);
    expect(free).not.toMatch(/RM6348|gca\.gov\.uk|salesforce|Government Commercial|Crown Commercial|Regional training places/i);
  });

  it("maps pipeline dates honestly and hides source fields from the free preview", async () => {
    const bytes = pipelineWorkbook([
      [
        "RM7101",
        "Regional training places",
        "Places for adult learners.",
        "Workforce",
        "Framework",
        "£12,500,000.00",
        "Nov-26",
        "Open Procedure",
        "80500000",
        "Training services",
        "Email: info@gca.gov.uk, Phone: 0345 410 2223",
        "Y",
        "Jan-27",
      ],
      [
        "RM7102",
        "Facilities support",
        "Building services.",
        "Estates",
        "Dynamic Market",
        "£1,000.00",
        "Oct-25",
        "Open Procedure",
        "79993000",
        "Facilities",
        "",
        "N",
        "Aug-26",
      ],
      ["RM7103", "", "Missing title", "Workforce", "Framework", "", "Nov-26", "", "", "", "", "", ""],
      ["NOT-RM", "Ignored row", "", "Workforce", "Framework", "", "Nov-26", "", "", "", "", "", ""],
    ]);
    let calls = 0;
    const source = gcaPipelineSourceRecord({ id: "gca-pipeline", enabled: true });
    const store = createMemoryIngestionStore({ sources: [source] });
    const adapter = createGcaPipelineAdapter({
      now: () => NOW,
      sleep: async () => undefined,
      http: {
        async getBytes() {
          calls += 1;
          return {
            url: "https://assets.gca.gov.uk/wp-content/uploads/Government-Commercial-Agency-Pipeline-10.08.2026.ods.xlsx.ods",
            status: 200,
            contentType: "application/vnd.oasis.opendocument.spreadsheet",
            body: bytes,
          };
        },
      },
    });
    const outcome = await runIngestion({
      sourceKey: GCA_PIPELINE_SOURCE_KEY,
      store,
      adapter,
      now: NOW,
      limit: 20,
      triggerType: "TEST",
      failureMode: "partial",
    });

    expect(calls).toBe(1);
    expect(outcome.counters.new).toBe(2);
    expect(outcome.counters.errorCount).toBe(1);
    const upcoming = store.deals.find((deal) => deal.reference === "RM7101");
    expect(upcoming?.status).toBe("UPCOMING");
    expect(upcoming?.stage).toBe("PLANNING");
    expect(upcoming?.dealType).toBe("FRAMEWORK");
    expect(upcoming?.valueMinExVat).toBeNull();
    expect(upcoming?.valueMaxExVat).toBeNull();
    expect(upcoming?.exactValueText).toBe("£12,500,000.00 including VAT");
    const open = store.deals.find((deal) => deal.reference === "RM7102");
    expect(open?.status).toBe("OPEN");
    expect(open?.dealType).toBe("DYNAMIC_MARKET");
    const preview = store.previews.find((item) => item.dealId === upcoming?.id);
    expect(preview?.isPublished).toBe(false);
    expect(preview?.leakageRisk).toBe("LOW");
    const free = publicPreviewText(preview!);
    expect(free).not.toMatch(
      /RM7101|gca\.gov\.uk|info@|0345|12,500,000|12500000|Government Commercial|Crown Commercial|Regional training places/i,
    );
  });

  it("links an RM already on Find a Tender or Contracts Finder and does not create a second deal", async () => {
    const fat = findATenderSourceRecord({ id: "fat" });
    const cf = contractsFinderSourceRecord({ id: "cf" });
    const gca = gcaPipelineSourceRecord({ id: "gca-pipeline", enabled: true });
    const store = createMemoryIngestionStore({ sources: [fat, cf, gca] });
    store.deals.push(
      portalDeal({
        id: "deal-fat",
        sourceId: fat.id,
        title: "Network services RM7003 replacement",
        reference: "ocds-h6vhtk-7003",
      }),
      portalDeal({
        id: "deal-dot",
        sourceId: fat.id,
        title: "Earlier agreement RM1557.14",
        reference: "ocds-h6vhtk-1557",
      }),
      portalDeal({
        id: "deal-cf",
        sourceId: cf.id,
        title: "Contracts Finder notice",
        reference: "RM7004",
      }),
    );
    const adapter = createGcaPipelineAdapter({
      now: () => NOW,
      sleep: async () => undefined,
      http: {
        async getBytes() {
          return {
            url: "https://assets.gca.gov.uk/file.ods",
            status: 200,
            contentType: "application/vnd.oasis.opendocument.spreadsheet",
            body: pipelineWorkbook([
              ["RM7003", "Radio service", "Radios.", "Technology", "Framework", "", "Nov-26", "", "", "", "", "", ""],
              ["RM1557", "Cloud support", "Hosting.", "Technology", "Framework", "", "Nov-26", "", "", "", "", "", ""],
              ["RM7004", "Print service", "Print.", "Technology", "Framework", "", "Nov-26", "", "", "", "", "", ""],
            ]),
          };
        },
      },
    });
    const outcome = await runIngestion({
      sourceKey: GCA_PIPELINE_SOURCE_KEY,
      store,
      adapter,
      now: NOW,
      limit: 20,
      triggerType: "TEST",
      skipPreview: true,
    });

    expect(outcome.counters.duplicatesLinked).toBe(2);
    expect(outcome.counters.new).toBe(1);
    expect(store.deals).toHaveLength(4);
    expect(store.deals.find((deal) => deal.id === "deal-fat")?.sourceTitle).toContain("RM7003");
    const linked = store.notices.filter(
      (notice) => notice.sourceId === gca.id && notice.isCurrentVersion === false,
    );
    expect(linked).toHaveLength(2);
    expect(linked.every((notice) => notice.isCurrentVersion === false)).toBe(true);
    expect(linked.map((notice) => notice.dealId).sort()).toEqual(["deal-cf", "deal-fat"]);
    expect(store.deals.find((deal) => deal.reference === "RM1557")?.primarySourceId).toBe(gca.id);
    expect(textHasReferenceToken("RM1557", "Earlier agreement RM1557.14")).toBe(false);
    expect(textHasReferenceToken("RM1557", "Network services RM1557 replacement")).toBe(true);
  });

  it("does not fetch a disabled source and caps a truncated catalogue without failing the job", async () => {
    const calls = { n: 0 };
    const disabled = createMemoryIngestionStore({
      sources: [gcaAgreementsSourceRecord({ id: "gca-off" })],
    });
    const skipped = await runOpenCatalogueIngest({
      store: disabled,
      dryRun: false,
      phase: "ingest",
      sourceKey: GCA_AGREEMENTS_SOURCE_KEY,
      adapter: createGcaAgreementsAdapter({
        http: jsonClient({ meta: { total_results: 1 }, results: [] }, calls),
      }),
      sleep: async () => undefined,
    });
    expect(skipped.status).toBe("SKIPPED");
    expect(calls.n).toBe(0);
    expect(openIngestShouldFail(skipped)).toBe(false);

    const enabled = createMemoryIngestionStore({
      sources: [gcaAgreementsSourceRecord({ id: "gca-on", enabled: true })],
    });
    const partial = await runOpenCatalogueIngest({
      store: enabled,
      dryRun: false,
      phase: "ingest",
      now: NOW,
      sourceKey: GCA_AGREEMENTS_SOURCE_KEY,
      sleep: async () => undefined,
      adapter: createGcaAgreementsAdapter({
        now: () => NOW,
        sleep: async () => undefined,
        http: jsonClient(
          {
            meta: { total_results: 99 },
            results: [
              {
                rm_number: "RM7200",
                title: "Workforce agreement",
                category: "Workforce",
                status: "Live",
                terms: "Framework",
                end_date: "2028-01-01",
              },
            ],
          },
          calls,
        ),
      }),
    });
    expect(partial.status).toBe("PARTIAL");
    expect(partial.counts.capped).toBe(1);
    expect(partial.counts.new).toBe(1);
    expect(openIngestShouldFail(partial)).toBe(false);
    expect(enabled.previews).toHaveLength(0);
  });

  it("leaves NHS sources unregistered and records them as unknown", () => {
    const keys = listRegisteredSourceKeys();
    expect(keys).toContain(GCA_AGREEMENTS_SOURCE_KEY);
    expect(keys).toContain(GCA_PIPELINE_SOURCE_KEY);
    expect(keys).not.toContain("nhs-supply-chain");
    expect(keys).not.toContain("nhs-sbs");
    const sql = fs.readFileSync(
      path.join(ROOT, "supabase/migrations/0041_gca_and_nhs_sources.sql"),
      "utf8",
    );
    expect(sql).toContain("'gca-agreements'");
    expect(sql).toContain("'OPEN_LICENSE'");
    const supply = sql.slice(sql.indexOf("'nhs-supply-chain'"), sql.indexOf("'nhs-sbs'"));
    const sbs = sql.slice(sql.indexOf("'nhs-sbs'"), sql.indexOf("on conflict"));
    expect(supply).toContain("'PROHIBITED'");
    expect(supply).toContain("false");
    expect(sbs).toContain("'PROHIBITED'");
    expect(sbs).toContain("false");
    expect(sql).not.toContain("'UNKNOWN'");
    expect(sql).not.toMatch(/disable row level security/i);
    expect(sql.match(/false,/g)?.length).toBeGreaterThanOrEqual(8);
    const upcoming = mapPipelineRow(
      [
        "RM7300",
        "Future framework",
        "Description",
        "Workforce",
        "Framework",
        "",
        "Dec-26",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      NOW,
    );
    expect(upcoming.status).toBe("UPCOMING");
    const live = mapGcaAgreement(
      {
        rm_number: "rm7301",
        title: "Live framework",
        status: "Live",
        terms: "Framework",
        end_date: "2027-01-01",
      },
      NOW,
    );
    expect(live.status).toBe("OPEN");
    expect(live.reference).toBe("RM7301");
  });
});
