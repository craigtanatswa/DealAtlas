import { describe, expect, it } from "vitest";

import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import {
  PLACEHOLDER_BUYER_NAMES,
  isPlaceholderBuyerName,
} from "@/lib/buyers/placeholder";
import { runOpenFindATenderIngest } from "@/lib/jobs/ingest-open";
import { runHttpPass } from "@/lib/leak-scan/http-pass";
import { isGenericName, sourceManifestTokens } from "@/lib/leak-scan/tokens";
import { packageFromFixtures } from "@/tests/helpers/ingestion-fixtures";

const ORIGIN = "https://www.dealatlas.uk";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";
const SLUG = "energy-procurement-pipeline-for-a-utility-organi-fa647a97";
const NOW = new Date("2026-09-10T12:00:00.000Z");

function sitemapWith(...paths: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
    .map((path) => `<url><loc>${ORIGIN}${path}</loc></url>`)
    .join("")}</urlset>`;
}

async function buyerHits(buyerName: string, aliases: string[], sitemap: string, html = "<html></html>") {
  const tokens = sourceManifestTokens({
    dealId: DEAL_ID,
    sourceTitle: "unrelated source title that is long enough",
    buyerName,
    buyerAliases: aliases,
    ocid: null,
    reference: null,
    externalPrimaryId: null,
    sourceUrl: null,
    buyerEmail: null,
  });
  const fetchImpl = (async (url: string) => {
    const href = String(url);
    const body = href.endsWith("/sitemap.xml") && !href.includes("/deals/") ? sitemap : href.endsWith("/deals") ? html : "<html></html>";
    return new Response(body, { status: 200, headers: { "content-type": href.endsWith(".xml") ? "application/xml" : "text/html" } });
  }) as typeof fetch;
  const result = await runHttpPass({
    origin: ORIGIN,
    fetchImpl,
    dealTokens: [{ dealId: DEAL_ID, slug: SLUG, tokens }],
    legacySlugs: [],
    sampleSeed: 0,
  });
  return result.findings.filter((finding) => finding.code === "BUYER_NAME");
}

describe("placeholder buyer names", () => {
  it("pins the exact list", () => {
    expect(PLACEHOLDER_BUYER_NAMES).toEqual([
      "buyer",
      "client",
      "confidential",
      "contracting authority",
      "contracting body",
      "contracting entity",
      "n a",
      "na",
      "none",
      "not applicable",
      "not known",
      "not specified",
      "public authority",
      "public body",
      "public sector",
      "tbc",
      "to be confirmed",
      "unknown",
      "various",
      "withheld",
    ]);
    expect(Object.isFrozen(PLACEHOLDER_BUYER_NAMES)).toBe(true);
  });

  it("matches the whole normalised name only", () => {
    for (const name of ["Public Sector", " public  SECTOR. ", "N/A", "n.a.", "Contracting Authority", "UNKNOWN", "Not specified"]) {
      expect(isPlaceholderBuyerName(name)).toBe(true);
    }
    for (const name of ["Public Sector Pension Board", "Leeds City Council", "Buyer Services Ltd", "Sector", "", null, undefined]) {
      expect(isPlaceholderBuyerName(name)).toBe(false);
    }
    expect(isGenericName("Public Sector Pension Board")).toBe(false);
    expect(isGenericName("Sector Holdings")).toBe(false);
  });

  it("gives 0 BUYER_NAME hits for buyer and alias 'Public Sector' against the guides sitemap", async () => {
    const hits = await buyerHits(
      "Public Sector",
      ["Public Sector"],
      sitemapWith("/guides", "/guides/how-to-find-public-sector-tenders", `/deals/${SLUG}`),
    );
    expect(hits).toEqual([]);
  });

  it("still flags a real council or NHS trust name in the sitemap or HTML", async () => {
    expect(
      await buyerHits("Leeds City Council", [], sitemapWith("/guides/leeds-city-council-tenders")),
    ).toEqual([expect.objectContaining({ dealId: DEAL_ID, path: "/sitemap.xml" })]);
    expect(
      await buyerHits(
        "Leeds Teaching Hospitals NHS Trust",
        [],
        sitemapWith("/guides"),
        "<html><p>Leeds Teaching Hospitals NHS Trust</p></html>",
      ),
    ).toEqual([expect.objectContaining({ dealId: DEAL_ID, path: "/deals" })]);
  });
});

describe("ingest with a placeholder buyer", () => {
  async function ingestWithBuyer(name: string) {
    const pkg = packageFromFixtures(["normal.json"]) as {
      releases: Array<{ buyer?: { name: string }; parties?: Array<{ name: string }> }>;
    };
    for (const release of pkg.releases) {
      if (release.buyer) release.buyer.name = name;
      for (const party of release.parties ?? []) party.name = name;
    }
    const memory = createMemoryIngestionStore({ sources: [findATenderSourceRecord({ id: "source-fat" })] });
    const result = await runOpenFindATenderIngest({
      store: memory,
      now: NOW,
      dryRun: false,
      backfillDays: 7,
      phase: "ingest",
      sleep: async () => {},
      http: {
        async getJson(url) {
          return { url, status: 200, contentType: "application/json", body: pkg, rawText: "{}" };
        },
      },
    });
    return { memory, result };
  }

  it("creates no buyer org and no buyer link for 'Public Sector'", async () => {
    const { memory, result } = await ingestWithBuyer("Public Sector");
    expect(result.counts.new).toBeGreaterThan(0);
    expect(memory.deals.length).toBeGreaterThan(0);
    expect(memory.deals.every((deal) => deal.buyerOrganizationId === null)).toBe(true);
    expect(memory.organizations).toEqual([]);
    expect(memory.dealOrganizations.filter((link) => link.role === "BUYER")).toEqual([]);
  });

  it("still links a real buyer", async () => {
    const { memory } = await ingestWithBuyer("Leeds City Council");
    expect(memory.organizations.map((org) => org.canonicalName)).toContain("Leeds City Council");
    const buyerId = memory.organizations.find((org) => org.canonicalName === "Leeds City Council")!.id;
    expect(memory.deals.every((deal) => deal.buyerOrganizationId === buyerId)).toBe(true);
    expect(memory.dealOrganizations.filter((link) => link.role === "BUYER" && link.organizationId === buyerId).length).toBeGreaterThan(0);
  });
});
