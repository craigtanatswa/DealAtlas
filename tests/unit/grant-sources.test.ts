import { describe, expect, it } from "vitest";

import { runIngestion } from "@/ingestion/core/pipeline";
import { createFindAGrantAdapter } from "@/ingestion/sources/find-a-grant/adapter";
import { FIND_A_GRANT_SOURCE_KEY } from "@/ingestion/sources/find-a-grant/constants";
import { findAGrantSourceRecord } from "@/ingestion/sources/find-a-grant/seed";
import { buildGrantCandidate } from "@/ingestion/sources/grant-notice/map";
import { createInnovateUkAdapter } from "@/ingestion/sources/innovate-uk/adapter";
import { INNOVATE_UK_SOURCE_KEY } from "@/ingestion/sources/innovate-uk/constants";
import { innovateUkSourceRecord } from "@/ingestion/sources/innovate-uk/seed";
import { contextFromCandidate } from "@/ingestion/intelligence/types";
import { generatePreviewDraft } from "@/ingestion/preview/generate";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import type { TextGetResult } from "@/ingestion/core/http";
import { listRegisteredSourceKeys } from "@/ingestion/sources/registry";
import { dropLeakingReasons } from "@/lib/matching/sanitize";
import { runOpenFindAGrantIngest } from "@/lib/jobs/ingest-open";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const TITLE = "Coastal sensor trial programme";
const FUNDER = "Canary Forestry Commission";
const GRANT_ID = "grant-canary-001";

function textResult(url: string, body: string, status = 200): TextGetResult {
  return { url, status, contentType: "text/html", body };
}

function grantHtml(grants: unknown[], page = 1, total = grants.length): string {
  const payload = {
    props: {
      pageProps: {
        searchResult: grants,
        currentPage: String(page),
        totalGrants: total,
      },
    },
  };
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>`;
}

function goodGrant(id = GRANT_ID) {
  return {
    id,
    label: "coastal-sensor",
    grantName: TITLE,
    grantShortDescription: "Canary description that must stay off the free preview.",
    grantFunder: FUNDER,
    grantMinimumAward: 1500,
    grantMaximumAward: 30500,
    grantMinimumAwardDisplay: "£1,500",
    grantMaximumAwardDisplay: "£30,500",
    grantApplicationOpenDate: "2026-01-01T00:00",
    grantApplicationCloseDate: "2026-12-01T00:00",
    grantLocation: ["England"],
  };
}

function innovateHtml(options: { next?: boolean; bad?: boolean } = {}): string {
  const bad = options.bad
    ? `<li><h2><a href="/competition/9/overview/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"></a></h2></li>`
    : "";
  const next = options.next ? `<a href="?page=1" rel="next">Next</a>` : "";
  return `<ul><li><h2><a href="/competition/2602/overview/607351e2-798f-450b-b77d-3131912bcbef">${TITLE}</a></h2><div class="wysiwyg-styles govuk-!-margin-bottom-4">Canary competition summary that must stay off the free preview entirely.</div><h3>Open</h3><dl><dt>Opens:</dt><dd>1 January 2026</dd><dt>Closes:</dt><dd>1 December 2026</dd></dl></li>${bad}</ul>${next}`;
}

function freePreview(draft: {
  previewTitle: string;
  previewSummary: string;
  broadRegion: string | null;
  valueBand: string;
  deadlineBand: string;
  requirementsPreview: string[];
  relevanceTags: string[];
  freshnessLabel: string;
}): string {
  return JSON.stringify(draft).toLowerCase();
}

describe("grant source seeds", () => {
  it("keeps Find a Grant and Innovate UK disabled without scraping permission", () => {
    for (const source of [findAGrantSourceRecord(), innovateUkSourceRecord()]) {
      expect(source.enabled).toBe(false);
      expect(source.scrapingPermitted).toBe(false);
      expect(source.reuseStatus).toBe("OPEN_LICENSE");
      expect(source.rateLimitPerMinute).toBe(10);
      expect(source.accessMethod).toBe("HTML");
    }
  });
});

describe("Find a Grant and Innovate UK ingestion", () => {
  it("does not fetch a disabled Find a Grant source", async () => {
    const calls: string[] = [];
    const store = createMemoryIngestionStore({
      sources: [findAGrantSourceRecord({ id: "src-grant" })],
    });
    const result = await runOpenFindAGrantIngest({
      store,
      dryRun: true,
      sleep: async () => {},
      http: {
        async getText(url: string) {
          calls.push(url);
          return textResult(url, "");
        },
      },
    });
    expect(result.status).toBe("SKIPPED");
    expect(calls).toEqual([]);
  });

  it("stops when robots.txt disallows the grant list", async () => {
    const store = createMemoryIngestionStore({
      sources: [
        findAGrantSourceRecord({
          id: "src-grant",
          enabled: true,
          scrapingPermitted: true,
        }),
      ],
    });
    const result = await runIngestion({
      sourceKey: FIND_A_GRANT_SOURCE_KEY,
      store,
      now: NOW,
      adapter: createFindAGrantAdapter({
        now: () => NOW,
        http: {
          async getText(url: string) {
            if (url.endsWith("/robots.txt")) {
              return textResult(url, "User-agent: *\nDisallow: /grants\n", 200);
            }
            return textResult(url, grantHtml([goodGrant()]));
          },
        },
      }),
      failureMode: "partial",
    });
    expect(result.errors.some((error) => error.code === "ROBOTS_DISALLOW")).toBe(true);
    expect(result.counters.fetched).toBe(0);
  });

  it("continues after a malformed grant row and links a matching Innovate UK title", async () => {
    const store = createMemoryIngestionStore({
      sources: [
        findAGrantSourceRecord({
          id: "src-grant",
          enabled: true,
          scrapingPermitted: true,
        }),
        innovateUkSourceRecord({
          id: "src-innovate",
          enabled: true,
          scrapingPermitted: true,
        }),
      ],
    });
    const grantRun = await runIngestion({
      sourceKey: FIND_A_GRANT_SOURCE_KEY,
      store,
      now: NOW,
      adapter: createFindAGrantAdapter({
        now: () => NOW,
        http: {
          async getText(url: string) {
            if (url.endsWith("/robots.txt")) return textResult(url, "not found", 404);
            return textResult(url, grantHtml([goodGrant(), { id: "grant-bad", grantName: "" }]));
          },
        },
      }),
      failureMode: "partial",
    });
    expect(grantRun.counters.new).toBe(1);
    expect(grantRun.counters.errorCount).toBe(1);

    const innovateRun = await runIngestion({
      sourceKey: INNOVATE_UK_SOURCE_KEY,
      store,
      now: NOW,
      adapter: createInnovateUkAdapter({
        now: () => NOW,
        http: {
          async getText(url: string) {
            // A robots.txt redirect is disallow-all (see ingestion-robots.test.ts).
            if (url.endsWith("/robots.txt")) return textResult(url, "missing", 404);
            return textResult(url, innovateHtml());
          },
        },
      }),
      failureMode: "partial",
    });
    expect(innovateRun.counters.duplicatesLinked).toBe(1);
    expect(innovateRun.counters.new).toBe(0);

    const grantDeal = await store.findDealByOcid(`da-find-a-grant-${GRANT_ID}`);
    const innovateDeal = await store.findDealByOcid(
      "da-innovate-uk-607351e2-798f-450b-b77d-3131912bcbef",
    );
    expect(grantDeal?.dealType).toBe("GRANT");
    expect(innovateDeal).toBeNull();
    const notice = await store.findNotice(
      "src-innovate",
      "607351e2-798f-450b-b77d-3131912bcbef",
      "607351e2-798f-450b-b77d-3131912bcbef",
    );
    expect(notice?.dealId).toBe(grantDeal?.id);
  });

  it("paces Find a Grant below 10 requests a minute", async () => {
    const sleeps: number[] = [];
    const store = createMemoryIngestionStore({
      sources: [
        findAGrantSourceRecord({
          id: "src-grant",
          enabled: true,
          scrapingPermitted: true,
        }),
      ],
    });
    await runOpenFindAGrantIngest({
      store,
      dryRun: true,
      now: NOW,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      http: {
        async getText(url: string) {
          if (url.endsWith("/robots.txt")) return textResult(url, "missing", 404);
          const page = Number(new URL(url).searchParams.get("page") ?? "1");
          return textResult(url, grantHtml([goodGrant(`grant-${page}`)], page, 110));
        },
      },
    });
    expect(sleeps.length).toBeGreaterThan(0);
  });
});

describe("free preview sanitiser", () => {
  it("does not register fetchers for prohibited portals", () => {
    const keys = listRegisteredSourceKeys();
    expect(keys).not.toContain("etendersni");
    expect(keys).not.toContain("ukri-funding-finder");
  });

  it.each([
    ["find a grant", "Find a Grant notice FG-100 at find-government-grants.service.gov.uk"],
    ["innovate uk", "Innovate UK competition on the Innovation Funding Service"],
    ["etendersni", "eTendersNI CFT 88421 at https://etendersni.gov.uk/epps/view.do"],
    ["ukri funding finder", "UKRI Funding Finder opportunity at https://www.ukri.org/opportunity/"],
  ])("drops a %s reason", (_name, label) => {
    expect(
      dropLeakingReasons([{ code: "KEYWORD_OVERLAP", kind: "match", label }]),
    ).toEqual([]);
  });

  it("does not pass Find a Grant identity to a free preview", async () => {
    const draft = await previewForGrant();
    const free = freePreview(draft);
    expect(draft.leakageRisk).toBe("LOW");
    for (const marker of [
      TITLE.toLowerCase(),
      FUNDER.toLowerCase(),
      GRANT_ID,
      "find-government-grants",
      "find a grant",
      "£1,500",
      "£30,500",
    ]) {
      expect(free).not.toContain(marker);
    }
  });

  it("does not pass Innovate UK identity to a free preview", async () => {
    const store = createMemoryIngestionStore({
      sources: [
        innovateUkSourceRecord({
          id: "src-innovate",
          enabled: true,
          scrapingPermitted: true,
        }),
      ],
    });
    await runIngestion({
      sourceKey: INNOVATE_UK_SOURCE_KEY,
      store,
      now: NOW,
      adapter: createInnovateUkAdapter({
        now: () => NOW,
        http: {
          async getText(url: string) {
            if (url.endsWith("/robots.txt")) return textResult(url, "missing", 404);
            return textResult(url, innovateHtml());
          },
        },
      }),
    });
    const deal = await store.findDealByOcid(
      "da-innovate-uk-607351e2-798f-450b-b77d-3131912bcbef",
    );
    expect(deal).not.toBeNull();
    const draft = await draftFor(store, deal!.id, innovateUkSourceRecord({ id: "src-innovate" }), {
      noticeIdentifier: "607351e2-798f-450b-b77d-3131912bcbef",
    });
    const free = freePreview(draft);
    expect(draft.leakageRisk).toBe("LOW");
    for (const marker of [
      TITLE.toLowerCase(),
      "innovate uk",
      "innovation funding service",
      "apply-for-innovation-funding",
      "607351e2-798f-450b-b77d-3131912bcbef",
    ]) {
      expect(free).not.toContain(marker);
    }
  });

  it("does not pass eTendersNI identity to a free preview", async () => {
    const candidate = buildGrantCandidate({
      sourceKey: "etendersni",
      id: "CFT-88421",
      title: "Canary portal works package for harbour fenders",
      description: "Portal description that must stay off the free preview.",
      sourceUrl: "https://etendersni.gov.uk/epps/cft/view.do?id=88421",
      funder: "Canary Harbour Authority",
      mainCategory: "Funding",
      now: NOW,
      closesAt: "2026-12-01T00:00:00.000Z",
      opensAt: "2026-01-01T00:00:00.000Z",
    });
    const source = findAGrantSourceRecord({
      id: "src-etn",
      sourceKey: "etendersni",
      name: "eTendersNI",
      enabled: true,
      scrapingPermitted: true,
    });
    const store = createMemoryIngestionStore({ sources: [source] });
    await runIngestion({
      sourceKey: "etendersni",
      store,
      now: NOW,
      adapter: {
        sourceKey: "etendersni",
        async discover() {
          return {
            items: [
              {
                externalRecordId: candidate.externalPrimaryId,
                sourceUrl: candidate.sourceUrl,
                payload: candidate,
              },
            ],
          };
        },
        async fetch(item) {
          return {
            externalRecordId: item.externalRecordId,
            sourceUrl: item.sourceUrl,
            fetchedAt: NOW.toISOString(),
            contentType: "text/html",
            parserVersion: "test",
            payload: candidate,
            http: { status: 200, url: candidate.sourceUrl, contentType: "text/html" },
          };
        },
        async parse() {
          return [candidate];
        },
      },
    });
    const deal = await store.findDealByOcid(candidate.ocid);
    const draft = await draftFor(store, deal!.id, source, candidate);
    const free = freePreview(draft);
    expect(draft.leakageRisk).toBe("LOW");
    for (const marker of [
      "etendersni",
      "cft-88421",
      "canary harbour",
      "harbour fenders",
    ]) {
      expect(free).not.toContain(marker);
    }
  });

  it("does not pass UKRI Funding Finder identity to a free preview", async () => {
    const candidate = buildGrantCandidate({
      sourceKey: "ukri-funding-finder",
      id: "UKRI-OPP-441",
      title: "Canary coastal sensor fellowship",
      description: "Funding finder text that must stay off the free preview.",
      sourceUrl: "https://www.ukri.org/opportunity/canary-coastal-sensor-fellowship/",
      funder: "Canary Research Council",
      mainCategory: "Funding",
      now: NOW,
      closesAt: "2026-12-01T00:00:00.000Z",
      opensAt: "2026-01-01T00:00:00.000Z",
    });
    const source = findAGrantSourceRecord({
      id: "src-ukri",
      sourceKey: "ukri-funding-finder",
      name: "UKRI Funding Finder",
      enabled: true,
      scrapingPermitted: true,
    });
    const store = createMemoryIngestionStore({ sources: [source] });
    await runIngestion({
      sourceKey: "ukri-funding-finder",
      store,
      now: NOW,
      adapter: {
        sourceKey: "ukri-funding-finder",
        async discover() {
          return {
            items: [
              {
                externalRecordId: candidate.externalPrimaryId,
                sourceUrl: candidate.sourceUrl,
                payload: candidate,
              },
            ],
          };
        },
        async fetch(item) {
          return {
            externalRecordId: item.externalRecordId,
            sourceUrl: item.sourceUrl,
            fetchedAt: NOW.toISOString(),
            contentType: "text/html",
            parserVersion: "test",
            payload: candidate,
            http: { status: 200, url: candidate.sourceUrl, contentType: "text/html" },
          };
        },
        async parse() {
          return [candidate];
        },
      },
    });
    const deal = await store.findDealByOcid(candidate.ocid);
    const draft = await draftFor(store, deal!.id, source, candidate);
    const free = freePreview(draft);
    expect(draft.leakageRisk).toBe("LOW");
    for (const marker of ["ukri", "ukri.org", "funding finder", "ukri-opp-441"]) {
      expect(free).not.toContain(marker);
    }
  });
});

async function previewForGrant() {
  const source = findAGrantSourceRecord({
    id: "src-grant",
    enabled: true,
    scrapingPermitted: true,
  });
  const store = createMemoryIngestionStore({ sources: [source] });
  await runIngestion({
    sourceKey: FIND_A_GRANT_SOURCE_KEY,
    store,
    now: NOW,
    adapter: createFindAGrantAdapter({
      now: () => NOW,
      http: {
        async getText(url: string) {
          if (url.endsWith("/robots.txt")) return textResult(url, "missing", 404);
          return textResult(url, grantHtml([goodGrant()]));
        },
      },
    }),
  });
  const deal = await store.findDealByOcid(`da-find-a-grant-${GRANT_ID}`);
  return draftFor(store, deal!.id, source, { noticeIdentifier: GRANT_ID });
}

async function draftFor(
  store: ReturnType<typeof createMemoryIngestionStore>,
  dealId: string,
  source: ReturnType<typeof findAGrantSourceRecord>,
  candidate: { noticeIdentifier: string },
) {
  const loaded = await store.getDealById(dealId);
  if (!loaded) throw new Error("missing deal");
  const buyer = loaded.buyerOrganizationId
    ? await store.getOrganizationById(loaded.buyerOrganizationId)
    : null;
  const lots = await store.listLotsForDeal(dealId);
  return generatePreviewDraft(
    contextFromCandidate({
      deal: loaded,
      source,
      buyer,
      buyerAliases: [],
      lots,
      candidate: {
        ...buildGrantCandidate({
          sourceKey: source.sourceKey,
          id: candidate.noticeIdentifier,
          title: loaded.sourceTitle,
          description: loaded.sourceDescription,
          sourceUrl: loaded.sourceUrl ?? "https://example.invalid/source",
          funder: buyer?.canonicalName,
          mainCategory: loaded.mainCategory ?? "Funding",
          now: NOW,
        }),
        noticeIdentifier: candidate.noticeIdentifier,
        externalPrimaryId: loaded.externalPrimaryId ?? candidate.noticeIdentifier,
        ocid: loaded.ocid ?? candidate.noticeIdentifier,
        reference: loaded.reference,
        sourceTitle: loaded.sourceTitle,
        sourceDescription: loaded.sourceDescription,
        sourceUrl: loaded.sourceUrl ?? "",
      },
      now: NOW,
    }),
  );
}
