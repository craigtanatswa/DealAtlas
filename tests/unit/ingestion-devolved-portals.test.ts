import { describe, expect, it } from "vitest";

import { IngestionError } from "@/ingestion/core/errors";
import { runIngestion } from "@/ingestion/core/pipeline";
import { monthsCovering, noticesUrl } from "@/ingestion/sources/ocds-monthly/adapter";
import { createPublicContractsScotlandAdapter } from "@/ingestion/sources/public-contracts-scotland/adapter";
import {
  PUBLIC_CONTRACTS_SCOTLAND_MONTHLY_SOURCE,
  PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
} from "@/ingestion/sources/public-contracts-scotland/constants";
import { parsePublicContractsScotlandRaw } from "@/ingestion/sources/public-contracts-scotland/parse";
import { publicContractsScotlandSourceRecord } from "@/ingestion/sources/public-contracts-scotland/seed";
import { createSell2WalesAdapter } from "@/ingestion/sources/sell2wales/adapter";
import {
  SELL2WALES_MONTHLY_SOURCE,
  SELL2WALES_SOURCE_KEY,
} from "@/ingestion/sources/sell2wales/constants";
import { parseSell2WalesRaw } from "@/ingestion/sources/sell2wales/parse";
import { sell2WalesSourceRecord } from "@/ingestion/sources/sell2wales/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import type { DealRecord } from "@/ingestion/store/types";
import {
  mergeOpenIngestChangedIds,
  openIngestPacerOptions,
  openIngestShouldFail,
  runOpenPublicContractsScotlandIngest,
  runOpenSell2WalesIngest,
} from "@/lib/jobs/ingest-open";
import { toPublicDealPreview } from "@/lib/search/dto";
import { FORBIDDEN_PUBLIC_KEYS } from "@/tests/helpers/protected-leak";

const NOW = new Date("2026-09-10T12:00:00.000Z");

const portals = [
  {
    key: PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
    prefix: "ocds-r6ebe6-",
    noticeType: 102,
    source: PUBLIC_CONTRACTS_SCOTLAND_MONTHLY_SOURCE,
    create: createPublicContractsScotlandAdapter,
    parse: parsePublicContractsScotlandRaw,
    record: publicContractsScotlandSourceRecord,
    run: runOpenPublicContractsScotlandIngest,
    host: "api.publiccontractsscotland.gov.uk",
  },
  {
    key: SELL2WALES_SOURCE_KEY,
    prefix: "ocds-kuma6s-",
    noticeType: 51,
    source: SELL2WALES_MONTHLY_SOURCE,
    create: createSell2WalesAdapter,
    parse: parseSell2WalesRaw,
    record: sell2WalesSourceRecord,
    run: runOpenSell2WalesIngest,
    host: "api.sell2wales.gov.wales",
  },
] as const;

function release(options: {
  prefix: string;
  id?: string;
  ocid?: string;
  tag?: string;
  title?: string;
  reference?: string;
  deadline?: string;
  related?: string;
  date?: string;
}) {
  const id = options.id ?? "rls-canary-88421";
  return {
    ocid: options.ocid ?? `${options.prefix}canary88421`,
    id,
    date: options.date ?? "2026-09-08T09:00:00Z",
    tag: [options.tag ?? "tender"],
    initiationType: "tender",
    tender: {
      id: options.reference ?? "PORTAL-REF-CANARY-88421",
      title: options.title ?? "Canary bridge painting notice",
      description: "Synthetic fixture.",
      status: "active",
      value: { amount: 40000, currency: "GBP" },
      tenderPeriod: { endDate: options.deadline ?? "2026-10-20T12:00:00Z" },
      classification: { scheme: "CPV", id: "90910000", description: "Cleaning services" },
      documents: [
        {
          id: "doc-canary-88421",
          title: "Canary specification",
          url: "https://canary-docs.example/spec-88421.pdf",
        },
      ],
    },
    parties: [
      {
        id: "GB-PPON-CANARY-88421",
        name: "Quellmoor Canary Council",
        identifier: { scheme: "GB-PPON", id: "CANARY-88421" },
        contactPoint: {
          name: "Canary Buyer",
          email: "procure.canary@pcs.example",
          telephone: "014149608842",
        },
        roles: ["buyer"],
      },
    ],
    buyer: { id: "GB-PPON-CANARY-88421", name: "Quellmoor Canary Council" },
    ...(options.related
      ? {
          relatedProcesses: [
            { id: "1", relationship: ["prior"], scheme: "ocid", identifier: options.related },
          ],
        }
      : {}),
  };
}

function packageOf(entries: unknown[], uri: string) {
  return {
    uri,
    version: "1.1",
    license: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    releases: entries,
  };
}

function httpFor(body: unknown) {
  const urls: string[] = [];
  return {
    urls,
    client: {
      async getJson(url: string) {
        urls.push(url);
        return {
          url,
          status: 200,
          contentType: "application/json",
          body,
          rawText: "{}",
        };
      },
    },
  };
}

const CANARIES = [
  "Quellmoor Canary Council",
  "procure.canary@pcs.example",
  "014149608842",
  "https://canary-docs.example/spec-88421.pdf",
  "rls-canary-88421",
  "canary88421",
  "PORTAL-REF-CANARY-88421",
  "Canary bridge painting notice",
  "Canary specification",
];

function existingDeal(
  ocid: string,
): Omit<DealRecord, "id" | "firstDiscoveredAt" | "sourceCount" | "normalizedTitle"> {
  return {
    primarySourceId: "source-fat",
    externalPrimaryId: ocid,
    ocid,
    reference: "FTS-1",
    sourceTitle: "Find a Tender original title",
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
    valueMaxExVat: 100,
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
    sourceUrl: "https://www.find-tender.service.gov.uk/Notice/example",
    applicationUrl: null,
    firstPublishedAt: NOW.toISOString(),
    latestSourceAt: NOW.toISOString(),
    lastVerifiedAt: NOW.toISOString(),
    dataQualityScore: 20,
  };
}

describe.each(portals)("$key OCDS adapter", (portal) => {
  const enabled = portal.record({ id: `source-${portal.key}`, enabled: true });

  function ingest(entries: unknown[], store = createMemoryIngestionStore({ sources: [enabled] })) {
    const body = packageOf(entries, noticesUrl(portal.source, "09-2026", portal.noticeType));
    const http = httpFor(body);
    const adapter = portal.create({
      http: http.client,
      now: () => NOW,
      noticeTypes: [portal.noticeType],
    });
    return {
      http,
      store,
      result: runIngestion({
        sourceKey: portal.key,
        store,
        adapter,
        now: NOW,
        limit: 10,
        triggerType: "TEST",
      }),
    };
  }

  it("is seeded disabled, closed to scraping, and under the Open Government Licence", () => {
    const row = portal.record();
    expect(row.reuseStatus).toBe("OPEN_LICENSE");
    expect(row.scrapingPermitted).toBe(false);
    expect(row.enabled).toBe(false);
    expect(row.rateLimitPerMinute).toBe(10);
    expect(row.accessMethod).toBe("OCDS_API");
  });

  it("opens a tender with a future deadline and keeps the API notice URL", () => {
    const [candidate] = portal.parse(
      { release: release({ prefix: portal.prefix }) },
      NOW,
    );
    expect(candidate.status).toBe("OPEN");
    expect(candidate.sourceKey).toBe(portal.key);
    expect(candidate.sourceUrl).toContain(portal.host);
    expect(candidate.sourceUrl).toContain("/v1/Notice");
    expect(candidate.sourceUrl).not.toContain("find-tender");
  });

  it("does not publish, and the free preview drops source identity", async () => {
    const run = ingest([release({ prefix: portal.prefix })]);
    const outcome = await run.result;
    expect(outcome.counters.new).toBe(1);
    expect(run.store.previews[0]?.isPublished).toBe(false);
    expect(run.store.organizations.some((org) => org.email === "procure.canary@pcs.example")).toBe(
      true,
    );
    expect(
      run.store.documents.some((doc) => doc.sourceUrl.includes("spec-88421.pdf")),
    ).toBe(true);

    const preview = run.store.previews[0];
    expect(preview).toBeTruthy();
    const poisoned = {
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
      buyer_name: "Quellmoor Canary Council",
      buyerName: "Quellmoor Canary Council",
      source_url: "https://canary-docs.example/spec-88421.pdf",
      sourceUrl: "https://canary-docs.example/spec-88421.pdf",
      ocid: `${portal.prefix}canary88421`,
      reference: "PORTAL-REF-CANARY-88421",
      notice_identifier: "rls-canary-88421",
      contact_email: "procure.canary@pcs.example",
      email: "procure.canary@pcs.example",
      phone: "014149608842",
      documents: [{ url: "https://canary-docs.example/spec-88421.pdf" }],
    };
    const dto = toPublicDealPreview(poisoned);
    const json = JSON.stringify(dto);
    for (const key of FORBIDDEN_PUBLIC_KEYS) {
      expect(key in dto).toBe(false);
    }
    for (const canary of CANARIES) {
      expect(json).not.toContain(canary);
    }
    expect(json).not.toContain(portal.host);
    expect(json).not.toContain("sell2wales");
    expect(json).not.toContain("publiccontractsscotland");
  });

  it("continues after a release that has no title", async () => {
    const bad = release({ prefix: portal.prefix, id: "rls-bad" });
    bad.tender.title = "";
    const run = ingest([
      bad,
      release({ prefix: portal.prefix, id: "rls-good", ocid: `${portal.prefix}good` }),
    ]);
    const outcome = await run.result;
    expect(outcome.counters.new).toBe(1);
    expect(outcome.counters.errorCount).toBe(1);
    expect(outcome.status).toBe("PARTIAL");
    expect(run.store.deals).toHaveLength(1);
  });

  it("attaches a Find a Tender relatedProcesses OCID instead of creating a deal", async () => {
    const store = createMemoryIngestionStore({
      sources: [
        enabled,
        portal.record({ id: "source-fat", sourceKey: "find-a-tender", enabled: true }),
      ],
    });
    const shared = "ocds-h6vhtk-fixture-shared";
    const existing = await store.createDeal(existingDeal(shared));
    await store.upsertDealPreview({
      dealId: existing.id,
      slug: "existing-preview",
      previewTitle: "Existing preview",
      previewSummary: "Already published synthetic preview.",
      dealType: "PUBLIC_TENDER",
      buyerSector: "PUBLIC",
      stage: "LIVE",
      status: "OPEN",
      mainCategory: null,
      broadRegion: null,
      valueBand: "Undisclosed",
      deadlineBand: "Closed",
      durationBand: "Not disclosed",
      smeSuitability: null,
      bidComplexity: null,
      competitionLevel: null,
      requirementsPreview: [],
      relevanceTags: [],
      freshnessLabel: null,
      leakageRisk: "LOW",
      isPublished: true,
      unpublishedByAdmin: false,
    });
    const run = ingest(
      [
        release({
          prefix: portal.prefix,
          ocid: `${portal.prefix}other`,
          related: shared,
        }),
      ],
      store,
    );
    const outcome = await run.result;
    expect(outcome.counters.duplicatesLinked).toBe(1);
    expect(outcome.counters.new).toBe(0);
    expect(store.deals).toHaveLength(1);
    expect(store.deals[0]?.sourceTitle).toBe("Find a Tender original title");
    expect(store.deals[0]?.primarySourceId).toBe("source-fat");
    expect(store.notices.some((notice) => notice.sourceId === enabled.id)).toBe(true);
    expect(store.previews[0]?.isPublished).toBe(true);
  });

  it("attaches when the notice OCID already belongs to another source", async () => {
    const store = createMemoryIngestionStore({
      sources: [
        enabled,
        portal.record({ id: "source-fat", sourceKey: "find-a-tender", enabled: true }),
      ],
    });
    const shared = `${portal.prefix}same-ocid`;
    await store.createDeal(existingDeal(shared));
    const run = ingest([release({ prefix: portal.prefix, ocid: shared })], store);
    const outcome = await run.result;
    expect(outcome.counters.duplicatesLinked).toBe(1);
    expect(store.deals).toHaveLength(1);
    expect(store.deals[0]?.primarySourceId).toBe("source-fat");
  });

  it("requests only the official OCDS list and pages locally", async () => {
    const body = packageOf(
      [
        release({ prefix: portal.prefix, id: "rls-1", ocid: `${portal.prefix}1` }),
        release({ prefix: portal.prefix, id: "rls-2", ocid: `${portal.prefix}2` }),
      ],
      "https://example.invalid/ignored",
    );
    const http = httpFor(body);
    const adapter = portal.create({
      http: http.client,
      now: () => NOW,
      noticeTypes: [portal.noticeType],
    });
    const first = await adapter.discover(undefined, { limit: 1 });
    const second = await adapter.discover(first.nextCursor, { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.externalRecordId).not.toBe(first.items[0]?.externalRecordId);
    expect(http.urls).toHaveLength(1);
    const url = new URL(http.urls[0] ?? "");
    expect(url.hostname).toBe(portal.host);
    expect(url.pathname).toBe("/v1/Notices");
    expect(url.searchParams.get("outputType")).toBe("0");
    expect(url.searchParams.get("noticeType")).toBe(String(portal.noticeType));
    expect(url.searchParams.get("dateFrom")).toBe("09-2026");
    if (portal.key === SELL2WALES_SOURCE_KEY) {
      expect(url.searchParams.get("locale")).toBe("2057");
    }
  });

  it("retries a 429 through the shared fetch retry", async () => {
    let attempts = 0;
    const adapter = portal.create({
      now: () => NOW,
      noticeTypes: [portal.noticeType],
      http: {
        async getJson(url: string) {
          attempts += 1;
          if (attempts === 1) {
            throw new IngestionError({
              message: "rate limited",
              stage: "fetch",
              code: "HTTP_429",
              retryable: true,
              details: { retryAfterMs: 0 },
            });
          }
          const body = packageOf([release({ prefix: portal.prefix })], url);
          return {
            url,
            status: 200,
            contentType: "application/json",
            body,
            rawText: "{}",
          };
        },
      },
    });
    const page = await adapter.discover(undefined, { limit: 1 });
    expect(attempts).toBe(2);
    expect(page.items).toHaveLength(1);
  });

  it("does not fetch while the source is disabled, and that skip is not a failure", async () => {
    const store = createMemoryIngestionStore({
      sources: [portal.record({ id: `source-${portal.key}` })],
    });
    const result = await portal.run({
      store,
      now: NOW,
      dryRun: false,
      backfillDays: 7,
      sleep: async () => {},
      http: {
        async getJson() {
          throw new Error("disabled source must not fetch");
        },
      },
    });
    expect(result.status).toBe("SKIPPED");
    expect(openIngestShouldFail(result)).toBe(false);
    expect(result.counts.fetched).toBe(0);
  });
});

describe("devolved portal pacing", () => {
  it("caps Public Contracts Scotland and Sell2Wales at 10 requests a minute", () => {
    expect(openIngestPacerOptions(PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY)).toEqual({
      maxRequests: 10,
      windowMs: 60_000,
    });
    expect(openIngestPacerOptions(SELL2WALES_SOURCE_KEY)).toEqual({
      maxRequests: 10,
      windowMs: 60_000,
    });
    expect(monthsCovering(new Date("2026-09-28T00:00:00Z"), new Date("2026-10-05T00:00:00Z"))).toEqual([
      "09-2026",
      "10-2026",
    ]);
  });

  it("appends later sources onto the Find a Tender changed-id file", () => {
    expect(mergeOpenIngestChangedIds("find-a-tender", ["old"], ["fat"])).toEqual(["fat"]);
    expect(
      mergeOpenIngestChangedIds("public-contracts-scotland", ["fat"], ["pcs"]),
    ).toEqual(["fat", "pcs"]);
    expect(mergeOpenIngestChangedIds("sell2wales", ["fat", "pcs"], ["s2w"])).toEqual([
      "fat",
      "pcs",
      "s2w",
    ]);
  });
});
