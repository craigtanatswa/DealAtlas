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

  it("shows CPV descriptions, a day-count deadline and a publication month", async () => {
    const store = await ingest("normal.json");
    const preview = store.previews[0]!;
    const text = `${preview.previewTitle} ${preview.previewSummary} ${preview.requirementsPreview.join(" ")}`;
    expect(text.toLowerCase()).toContain("it services");
    expect(text).toMatch(/Closes in \d+ days/);
    expect(text).toContain("September 2026");
    expect(text).toContain("£250k–£500k");
    expect(text).not.toContain("Manchester");
    expect(preview.leakageRisk).toBe("LOW");
  });
});
