// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DealCard } from "@/components/deals/deal-card";
import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { runIngestion } from "@/ingestion/core/pipeline";
import { createFindATenderAdapter } from "@/ingestion/sources/find-a-tender/adapter";
import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import { toDealCardData, toPublicDealPreview, type PreviewDtoFields } from "@/lib/search/dto";
import { publicDealPreviewMetadata } from "@/lib/search/metadata";
import { publicAnalyticsContext } from "@/lib/seo/analytics";
import { webPageJsonLd } from "@/lib/seo/json-ld";
import { previewSitemapUrlsetXml } from "@/lib/seo/sitemap";
import {
  createFixtureHttpClient,
  packageFromFixtures,
} from "@/tests/helpers/ingestion-fixtures";

afterEach(cleanup);

const NOW = new Date("2026-09-10T12:00:00.000Z");

function wordWindows(text: string, size: number): string[] {
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const phrases: string[] = [];
  for (let index = 0; index <= words.length - size; index += 1) {
    phrases.push(words.slice(index, index + size).join(" "));
  }
  return phrases;
}

async function ingest(fixture: string) {
  const store = createMemoryIngestionStore({
    sources: [findATenderSourceRecord({ id: "source-fat" })],
  });
  const adapter = createFindATenderAdapter({
    http: createFixtureHttpClient(() => packageFromFixtures([fixture])),
    now: () => NOW,
  });
  await runIngestion({
    sourceKey: "find-a-tender",
    store,
    adapter,
    now: NOW,
    limit: 1,
    triggerType: "TEST",
  });
  return store;
}

function freeChannelBlob(store: Awaited<ReturnType<typeof ingest>>): string {
  const preview = store.previews[0]!;
  const deal = store.deals[0]!;
  const row = {
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
  } as PreviewDtoFields;
  const dto = toPublicDealPreview(row);
  const card = render(<DealCard deal={toDealCardData(dto)} />).container.innerHTML;
  const detail = render(<DealPreviewDetail deal={dto} />).container.innerHTML;
  const metadata = JSON.stringify(
    publicDealPreviewMetadata(dto, "http://localhost:3000/deals/" + dto.slug),
  );
  const jsonLd = JSON.stringify(
    webPageJsonLd({
      origin: "http://localhost:3000",
      path: `/deals/${dto.slug}`,
      name: dto.previewTitle,
      description: dto.previewSummary,
    }),
  );
  const sitemap = previewSitemapUrlsetXml([
    { url: `http://localhost:3000/deals/${dto.slug}`, lastModified: "2026-09-01" },
  ]);
  const analytics = JSON.stringify(
    publicAnalyticsContext({
      path: `/deals/${dto.slug}`,
      previewSlug: dto.slug,
      sourceUrl: deal.sourceUrl,
      buyerName: "Example City Council",
      sourceTitle: deal.sourceTitle,
    }),
  );
  return [JSON.stringify(dto), card, detail, metadata, jsonLd, sitemap, analytics].join("\n");
}

describe("free channels stay high information and low identifiability", () => {
  it("hides buyer, reference, URL, 7-word source runs and 8-digit CPV codes", async () => {
    for (const fixture of ["normal.json", "multi-lot.json"]) {
      const store = await ingest(fixture);
      const deal = store.deals[0]!;
      const blob = freeChannelBlob(store).toLowerCase();
      const buyer = store.organizations.find((org) => org.id === deal.buyerOrganizationId)?.canonicalName ?? "";
      expect(buyer.length).toBeGreaterThan(3);
      expect(blob).not.toContain(buyer.toLowerCase());
      for (const marker of [deal.reference, deal.ocid, deal.externalPrimaryId, deal.sourceUrl]) {
        expect(marker && blob.includes(marker.toLowerCase())).toBe(false);
      }
      expect(blob).not.toContain("find-tender.service.gov.uk");
      expect(blob).not.toContain("contractsfinder.service.gov.uk");
      expect(blob).not.toMatch(
        /https?:\/\/(?!localhost|schema\.org|www\.w3\.org|www\.sitemaps\.org)/,
      );
      for (const phrase of wordWindows(deal.sourceDescription ?? "", 7)) {
        expect(blob, phrase).not.toContain(phrase);
      }
      expect(blob).not.toMatch(/\b\d{8}\b/);
      expect(blob).not.toContain("72000000");
      expect(blob).not.toContain("45233100");
      expect(blob).not.toMatch(/£\d{1,3}(?:,\d{3})+/);
    }
  });

  it("shows the CPV division, banded dates and value, and no day count or month", async () => {
    const store = await ingest("normal.json");
    const preview = store.previews[0]!;
    const text = `${preview.previewTitle} ${preview.previewSummary} ${preview.requirementsPreview.join(" ")}`;
    expect(text.toLowerCase()).toContain("it services");
    expect(text).toContain("Closing window");
    expect(text).not.toMatch(/\bin \d+ days?\b/i);
    expect(text).not.toMatch(/(January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d/);
    expect(text).not.toMatch(/\blots?\b/i);
    expect(text).not.toMatch(/\d+ ?(percent|%)/i);
    expect(text).not.toMatch(/procedure/i);
    expect(text).toContain("£250k–£500k");
    expect(text).not.toContain("Manchester");
    expect(preview.leakageRisk).toBe("LOW");
  });
});

const ADVERSARIAL_MARKERS = [
  "westford",
  "wbc",
  "bids@westford.gov.uk",
  "westford.gov.uk",
  "westford-procurement.co.uk",
  "01793",
  "466 000",
  "ocds-",
  "tender_998877",
  "000777-2026",
  "ref:",
  "wbc/ict/77",
  "rm6187",
  "management consultancy framework",
  "crown commercial",
  "g-cloud",
  "in-tend",
  "proactis",
  "swindon",
  "sn1",
  "99999999",
  "240",
];

describe("adversarial source text never reaches a free channel (P1-3, P1-4)", () => {
  it("DTO JSON, card, detail, metadata/OG, JSON-LD, sitemap and analytics carry no identifiers", async () => {
    const store = await ingest("adversarial.json");
    const blob = freeChannelBlob(store).toLowerCase();
    for (const marker of ADVERSARIAL_MARKERS) {
      expect(blob, marker).not.toContain(marker);
    }
    expect(blob).not.toMatch(/https?:\/\/(?!localhost|schema\.org|www\.w3\.org|www\.sitemaps\.org)/);
    expect(blob).not.toMatch(/\b\d{8}\b/);
  });

  it("drops scope and technical specs when the source text is risky (fail-closed)", async () => {
    const store = await ingest("adversarial.json");
    const preview = store.previews[0]!;
    const lines = preview.requirementsPreview.map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    );
    expect(lines.some((line) => line.startsWith("scope:"))).toBe(false);
    expect(lines.some((line) => line.startsWith("technicalSpecs:"))).toBe(false);
    expect(lines.some((line) => /^quantities: .*\d/.test(line))).toBe(false);
  });

  it("the DTO decoder drops risky or unknown stored lines even if the DB held them", () => {
    const dto = toPublicDealPreview({
      slug: "it-services-for-a-public-organisation-deadbeef",
      preview_title: "IT services for a public organisation",
      preview_summary: "A public organisation is procuring IT services.",
      deal_type: "PUBLIC_TENDER",
      buyer_sector: "PUBLIC",
      stage: "LIVE",
      status: "OPEN",
      main_category: "Technology",
      broad_region: "South West England",
      value_band: "£250k–£500k",
      deadline_band: "Within 30 days",
      duration_band: "1–2 years",
      sme_suitability: "HIGH",
      bid_complexity: "MEDIUM",
      competition_level: "UNKNOWN",
      requirements_preview: [
        "scope: Contact bids@westford.gov.uk for the pack",
        "technicalSpecs: Hosted via In-Tend",
        "scope: Supply to Swindon",
        "keyDates: Closes in 21 days",
        "lotCount: 3",
        "procedureType: open procedure",
        "framework: yes",
        "Contact: x@y.com",
        "WESTFORD BOROUGH COUNCIL requirement",
        "financial capacity evidence",
        "standards: ISO 27001 information security",
      ],
      relevance_tags: [],
      freshness_label: null,
    } as PreviewDtoFields);
    const json = JSON.stringify(dto).toLowerCase();
    for (const marker of ["westford", "in-tend", "swindon", "closes in", "x@y.com", "open procedure"]) {
      expect(json, marker).not.toContain(marker);
    }
    expect(dto.requirementsPreview).toEqual(["financial capacity evidence"]);
    expect(dto.standards).toEqual(["ISO 27001 information security"]);
    expect(dto.scope).toBeNull();
    expect(dto.technicalSpecs).toEqual([]);
    expect(dto.keyDates).toBeNull();
    expect(Object.keys(dto)).not.toContain("lotCount");
    expect(Object.keys(dto)).not.toContain("framework");
  });
});
