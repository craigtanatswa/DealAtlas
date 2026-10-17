import { describe, expect, it, vi } from "vitest";

import { createAllowlistedTextClient } from "@/ingestion/core/http";
import { runIngestion } from "@/ingestion/core/pipeline";
import { openIngestLogLine, runOpenProcontractIngest } from "@/lib/jobs/ingest-open";
import { createProcontractAdapter } from "@/ingestion/sources/procontract/adapter";
import {
  PROCONTRACT_PORTALS,
  PROCONTRACT_USER_AGENT,
  pathBlockedByRobots,
  procontractFetcherAllowed,
  type ProcontractPortal,
} from "@/ingestion/sources/procontract/constants";
import { listRegisteredSourceKeys } from "@/ingestion/sources/registry";
import { linkProcontractDuplicate } from "@/ingestion/sources/procontract/link";
import {
  parseProcontractDetail,
  parseProcontractListing,
  procontractCandidate,
} from "@/ingestion/sources/procontract/parse";
import { procontractSourceRecord } from "@/ingestion/sources/procontract/seed";
import { createRequestPacer } from "@/ingestion/sources/find-a-tender/pace";
import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import { contractsFinderSourceRecord } from "@/ingestion/sources/contracts-finder/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import type { DealRecord, RawRecordRow } from "@/ingestion/store/types";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const ADVERT_A = "11111111-1111-4111-8111-111111111111";
const ADVERT_B = "22222222-2222-4222-8222-222222222222";

const LISTING = `<table id="opportunitiesGrid"><tbody>
<tr class="gridrow"><td><a href="/Advert?advertId=${ADVERT_A}">Synthetic window replacement</a></td><td>Example Borough Council</td><td>01/09/2026</td><td>11/09/2026</td><td>£10,000.00</td></tr>
<tr class="gridrow"><td>no link</td><td>Skipped Council</td><td>01/09/2026</td><td>11/09/2026</td><td>£1.00</td></tr>
<tr class="gridrow"><td><a href="/Advert?advertId=${ADVERT_B}">Synthetic door replacement</a></td><td>Example Borough Council</td><td>02/09/2026</td><td>12/09/2026</td><td>N/A</td></tr>
</tbody></table>`;

const DETAIL = `<table>
<tr><th>Reference</th><td>DN100001</td></tr>
<tr><th>Buyer</th><td>Example Borough Council</td></tr>
<tr><th>Description</th><td>Replace windows. Notice ocds-h6vhtk-100001.</td></tr>
<tr><th>Expression End</th><td>11/09/2026</td></tr>
</table>`;

function portal(overrides: Partial<ProcontractPortal> = {}): ProcontractPortal {
  const base = PROCONTRACT_PORTALS.find((item) => item.sourceKey === "essex-procontract")!;
  return {
    ...base,
    listingUrl: "https://procontract.due-north.com/Opportunities/portal/thechest",
    robotsDisallow: [],
    ...overrides,
  };
}

function raw(id = "raw-1"): RawRecordRow {
  return {
    id,
    sourceId: "chest",
    ingestionRunId: null,
    externalRecordId: ADVERT_A,
    sourceUrl: null,
    publishedAt: null,
    fetchedAt: NOW.toISOString(),
    contentHash: "hash-1",
    contentType: "text/html",
    rawPayload: {},
    parserVersion: "test",
  };
}

function dealInput(
  overrides: Partial<Omit<DealRecord, "id" | "firstDiscoveredAt" | "sourceCount" | "normalizedTitle">>,
): Omit<DealRecord, "id" | "firstDiscoveredAt" | "sourceCount" | "normalizedTitle"> {
  return {
    primarySourceId: "fat",
    externalPrimaryId: "ext-1",
    ocid: "ocds-h6vhtk-other",
    reference: null,
    sourceTitle: "Unrelated title",
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
    firstPublishedAt: NOW.toISOString(),
    latestSourceAt: NOW.toISOString(),
    lastVerifiedAt: null,
    dataQualityScore: null,
    ...overrides,
  };
}

describe("ProContract portals", () => {
  it("keeps every checked portal unfetched", () => {
    expect(PROCONTRACT_PORTALS.map((item) => item.sourceKey)).toEqual([
      "the-chest",
      "kent-business-portal",
      "source-leicestershire",
      "essex-procontract",
    ]);
    for (const item of PROCONTRACT_PORTALS) {
      expect(item.fetchPermitted).toBe(false);
      expect(item.scrapingPermitted).toBe(false);
      expect(item.enabled).toBe(false);
      expect(item.rssUrl).toBeNull();
    }
    const prohibited = ["the-chest", "kent-business-portal", "source-leicestershire"];
    for (const key of prohibited) {
      const item = PROCONTRACT_PORTALS.find((portal) => portal.sourceKey === key)!;
      expect(item.reuseStatus).toBe("PROHIBITED");
      expect(procontractFetcherAllowed(item)).toBe(false);
      expect(() => createProcontractAdapter({ portal: item })).toThrow(/PROHIBITED/);
    }
    const essex = PROCONTRACT_PORTALS.find((item) => item.sourceKey === "essex-procontract")!;
    expect(essex.reuseStatus).toBe("UNKNOWN");
    expect(procontractFetcherAllowed(essex)).toBe(true);
    expect(listRegisteredSourceKeys().filter((key) => prohibited.includes(key))).toEqual([]);
    expect(listRegisteredSourceKeys()).toContain("essex-procontract");
  });

  it("does not request a disabled portal", async () => {
    const http = { getText: vi.fn() };
    const adapter = createProcontractAdapter({
      portal: portal(),
      http,
      now: () => NOW,
    });
    await expect(adapter.discover()).resolves.toEqual({ items: [] });
    expect(http.getText).not.toHaveBeenCalled();
  });

  it("parses a public grid, skips a bad row, and reads a detail", () => {
    const rows = parseProcontractListing(LISTING);
    expect(rows.map((row) => row.advertId)).toEqual([ADVERT_A, ADVERT_B]);
    const detail = parseProcontractDetail(DETAIL);
    expect(detail.reference).toBe("DN100001");
    expect(detail.ocid).toBe("ocds-h6vhtk-100001");
    const candidate = procontractCandidate({
      sourceKey: "the-chest",
      row: rows[0]!,
      detail,
    });
    expect(candidate.ocid).toBe("ocds-h6vhtk-100001");
    expect(candidate.reference).toBe("DN100001");
    expect(candidate.submissionDeadline).toBe("2026-09-11T12:00:00.000Z");
    expect(candidate.valueMaxExVat).toBe(10000);
    expect(candidate.organizations[0]?.name).toBe("Example Borough Council");
  });

  it("continues when one detail request fails", async () => {
    const calls: string[] = [];
    const http = {
      async getText(url: string) {
        calls.push(url);
        if (url.includes(ADVERT_B)) {
          throw new Error("detail failed");
        }
        if (url.includes("/Advert")) {
          return { url, status: 200, contentType: "text/html", body: DETAIL };
        }
        return { url, status: 200, contentType: "text/html", body: LISTING };
      },
    };
    const adapter = createProcontractAdapter({
      portal: portal({ fetchPermitted: true }),
      http,
      pace: async () => undefined,
      now: () => NOW,
    });
    const discovered = await adapter.discover();
    expect(discovered.items.map((item) => item.externalRecordId)).toEqual([ADVERT_A, ADVERT_B]);
    expect(calls.some((url) => url.includes("/Login"))).toBe(false);
  });

  it("stops on a login or CAPTCHA listing and skips robots-disallowed detail paths", async () => {
    const http = {
      getText: vi.fn(async (url: string) => ({
        url,
        status: 200,
        contentType: "text/html",
        body: '<form><input type="password" name="password"></form>',
      })),
    };
    const blocked = createProcontractAdapter({
      portal: portal({ fetchPermitted: true }),
      http,
      pace: async () => undefined,
    });
    await expect(blocked.discover()).rejects.toMatchObject({ code: "ACCESS_RESTRICTED" });

    const detailCalls: string[] = [];
    const allowed = createProcontractAdapter({
      portal: portal({ fetchPermitted: true, robotsDisallow: ["/Advert"] }),
      http: {
        async getText(url: string) {
          detailCalls.push(url);
          return { url, status: 200, contentType: "text/html", body: LISTING };
        },
      },
      pace: async () => undefined,
    });
    const discovered = await allowed.discover();
    expect(discovered.items).toHaveLength(2);
    expect(detailCalls.some((url) => url.includes("/Advert"))).toBe(false);
    expect(pathBlockedByRobots("/user/login", ["/user/login"])).toBe(true);
    expect(pathBlockedByRobots("/Opportunities/portal/thechest", [])).toBe(false);
  });

  it("sends a descriptive user agent and stays at 6 requests per minute", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    const client = createAllowlistedTextClient(
      { protocol: "https:", hosts: ["procontract.due-north.com"], pathPrefixes: ["/Opportunities/"] },
      { fetchImpl, userAgent: PROCONTRACT_USER_AGENT },
    );
    await client.getText("https://procontract.due-north.com/Opportunities/portal/thechest");
    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect(headers.get("User-Agent")).toBe(PROCONTRACT_USER_AGENT);
    expect(PROCONTRACT_USER_AGENT).toMatch(/DealAtlas-ingest/);

    let nowMs = 0;
    const sleeps: number[] = [];
    const pace = createRequestPacer({
      maxRequests: 6,
      windowMs: 60_000,
      now: () => nowMs,
      sleep: async (ms) => {
        sleeps.push(ms);
        nowMs += ms;
      },
    });
    for (let i = 0; i < 7; i += 1) {
      await pace();
    }
    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThan(0);
  });

  it("logs counts only and does not publish from a disabled portal", async () => {
    expect(JSON.parse(openIngestLogLine({
      fetched: 1,
      new: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      capped: 0,
    }))).toEqual({
      fetched: 1,
      new: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      capped: 0,
    });
    const store = createMemoryIngestionStore({
      sources: [procontractSourceRecord("the-chest", { id: "chest" })],
    });
    let discovered = 0;
    const result = await runOpenProcontractIngest({
      store,
      sourceKey: "the-chest",
      dryRun: true,
      now: NOW,
      adapter: {
        sourceKey: "the-chest",
        async discover() {
          discovered += 1;
          return { items: [] };
        },
        async fetch() {
          throw new Error("no fetch");
        },
        async parse() {
          return [];
        },
      },
    });
    expect(result.status).toBe("SKIPPED");
    expect(result.errors[0]?.code).toBe("REUSE_PROHIBITED");
    expect(result.changedDealIds).toEqual([]);
    expect(discovered).toBe(0);
    expect(openIngestLogLine(result.counts)).not.toMatch(/http|title|buyer|ocds/i);
  });

  it("links Find a Tender and Contracts Finder duplicates and preserves the preview", async () => {
    const store = createMemoryIngestionStore({
      sources: [
        procontractSourceRecord("the-chest", { id: "chest" }),
        procontractSourceRecord("essex-procontract", {
          id: "essex",
          enabled: true,
          reuseStatus: "TERMS_REVIEWED",
          scrapingPermitted: true,
        }),
        findATenderSourceRecord({ id: "fat" }),
        contractsFinderSourceRecord({ id: "cf" }),
      ],
    });
    const buyer = await store.createOrganization({
      canonicalName: "Example Borough Council",
      normalizedName: "example borough council",
      buyerSector: "PUBLIC",
      website: null,
      domain: null,
      email: null,
      phone: null,
      addressLine1: null,
      city: null,
      region: null,
      postcode: null,
      countryCode: "GB",
      isSme: null,
      isVcse: null,
    });
    await store.createDeal(dealInput({
      ocid: "ocds-h6vhtk-100001",
      externalPrimaryId: "ocds-h6vhtk-100001",
      sourceTitle: "Find a Tender title",
    }));
    await store.createDeal(dealInput({
      primarySourceId: "cf",
      ocid: "ocds-other-1",
      externalPrimaryId: "cf-1",
      reference: "DN100001",
      sourceTitle: "Contracts Finder title",
    }));
    const titled = await store.createDeal(dealInput({
      primarySourceId: "fat",
      ocid: "ocds-h6vhtk-title",
      externalPrimaryId: "title-1",
      reference: null,
      sourceTitle: "Synthetic door replacement",
      buyerOrganizationId: buyer.id,
      submissionDeadline: "2026-09-12T12:00:00.000Z",
    }));

    const rows = parseProcontractListing(LISTING);
    const ocidCandidate = procontractCandidate({
      sourceKey: "the-chest",
      row: rows[0]!,
      detail: parseProcontractDetail(DETAIL),
    });
    const source = procontractSourceRecord("the-chest", { id: "chest" });
    expect(await linkProcontractDuplicate({
      store,
      source,
      raw: raw(),
      candidate: ocidCandidate,
      now: NOW,
    })).toBe(true);

    const referenceAdvert = "33333333-3333-4333-8333-333333333333";
    const referenceCandidate = procontractCandidate({
      sourceKey: "the-chest",
      row: {
        ...rows[1]!,
        advertId: referenceAdvert,
        title: "Different title",
        href: `/Advert?advertId=${referenceAdvert}`,
      },
      detail: { ...parseProcontractDetail(DETAIL), ocid: null },
    });
    expect(referenceCandidate.ocid.startsWith("da-")).toBe(true);
    expect(await linkProcontractDuplicate({
      store,
      source,
      raw: raw("raw-2"),
      candidate: referenceCandidate,
      now: NOW,
    })).toBe(true);

    const titleCandidate = procontractCandidate({
      sourceKey: "the-chest",
      row: rows[1]!,
      detail: null,
    });
    expect(await linkProcontractDuplicate({
      store,
      source,
      raw: raw("raw-3"),
      candidate: titleCandidate,
      now: NOW,
    })).toBe(true);
    expect(store.deals).toHaveLength(3);
    expect(store.notices.map((notice) => notice.dealId)).toContain(titled.id);
    expect(store.notices.every((notice) => notice.isCurrentVersion === false)).toBe(true);

    const http = {
      async getText(url: string) {
        return {
          url,
          status: 200,
          contentType: "text/html",
          body: url.includes("/Advert") ? DETAIL : LISTING,
        };
      },
    };
    const outcome = await runIngestion({
      sourceKey: "essex-procontract",
      store,
      adapter: createProcontractAdapter({
        portal: portal({ fetchPermitted: true }),
        http,
        pace: async () => undefined,
        now: () => NOW,
      }),
      now: NOW,
      dryRun: false,
      skipPreview: false,
      failureMode: "partial",
    });
    expect(outcome.counters.duplicatesLinked).toBeGreaterThan(0);
    expect(outcome.counters.new).toBe(0);
    expect(store.deals).toHaveLength(3);
    expect(store.previews.every((preview) => preview.isPublished === false)).toBe(true);
  });
});
