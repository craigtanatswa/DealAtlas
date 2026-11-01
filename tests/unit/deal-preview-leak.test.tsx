// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { DealSearchResults } from "@/components/deals/deal-search-results";
import { DEAL_PREVIEW_DETAIL_FIXTURE } from "@/components/deals/fixtures";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import { runIngestion } from "@/ingestion/core/pipeline";
import { createFindATenderAdapter } from "@/ingestion/sources/find-a-tender/adapter";
import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import { toPublicDealPreview } from "@/lib/search/dto";
import {
  createFixtureHttpClient,
  readFindATenderFixture,
} from "@/tests/helpers/ingestion-fixtures";
import { findProtectedMarkerLeaks } from "../helpers/protected-leak";

describe("free discovery HTML and protected paths", () => {
  it("renders free card/detail HTML without seeded protected markers", () => {
    const detail = render(<DealPreviewDetail deal={DEAL_PREVIEW_DETAIL_FIXTURE} />);
    const search = render(
      <DealSearchResults
        filters={{ page: 1, limit: 20 }}
        result={{
          items: [{ preview: DEAL_PREVIEW_DETAIL_FIXTURE, match: null }],
          total: 1,
          page: 1,
          pageSize: 20,
        }}
      />,
    );

    const html = `${detail.container.innerHTML}\n${search.container.innerHTML}`;
    expect(findProtectedMarkerLeaks(html)).toEqual([]);
    expect(html).not.toMatch(/\b\d{8}\b/);
    expect(html).not.toMatch(/blur/);
    expect(html).toContain(DEAL_PREVIEW_DETAIL_FIXTURE.previewTitle);
    expect(html).toContain("Unlock this opportunity with Pro");
    expect(html).toContain("1 opportunity");
  });

  it("does not accept protected values on the locked panel", () => {
    const html = render(<UnlockPanel />).container.innerHTML;
    expect(findProtectedMarkerLeaks(html)).toEqual([]);
    expect(html).not.toMatch(/CANARY/);
    expect(html).not.toMatch(/competitor/i);
  });

  it("does not ship a UI bypass or protected fields on free fixtures", () => {
    expect(DEAL_PREVIEW_DETAIL_FIXTURE).not.toHaveProperty("sourceTitle");
    expect(DEAL_PREVIEW_DETAIL_FIXTURE).not.toHaveProperty("sourceUrl");
    expect(DEAL_PREVIEW_DETAIL_FIXTURE).not.toHaveProperty("buyerName");
  });
});

const FTS_NOW = new Date("2026-09-10T12:00:00.000Z");

function privateFindATenderPackage() {
  const payload = readFindATenderFixture("normal.json") as {
    releases: Array<{
      parties: Array<{ details?: { classifications?: unknown[] } }>;
    }>;
  };
  const buyer = payload.releases[0]!.parties[0]!;
  buyer.details = {
    ...buyer.details,
    classifications: [
      { scheme: "UK_CA_TYPE", id: "privateUtility", description: "Private utility" },
    ],
  };
  return payload;
}

describe("private Find a Tender buyers stay out of the free preview", () => {
  it("hides the buyer, domain, source URL and reference", async () => {
    const store = createMemoryIngestionStore({
      sources: [findATenderSourceRecord({ id: "source-fat" })],
    });
    const adapter = createFindATenderAdapter({
      http: createFixtureHttpClient(() => privateFindATenderPackage()),
      now: () => FTS_NOW,
    });
    await runIngestion({
      sourceKey: "find-a-tender",
      store,
      adapter,
      now: FTS_NOW,
      limit: 1,
      triggerType: "TEST",
    });

    const deal = store.deals[0]!;
    expect(deal.buyerSector).toBe("PRIVATE");
    const preview = store.previews[0]!;
    const dto = toPublicDealPreview({
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
    });
    const html = [
      render(<DealPreviewDetail deal={dto} />).container.innerHTML,
      render(
        <DealSearchResults
          filters={{ page: 1, limit: 20 }}
          result={{
            items: [{ preview: dto, match: null }],
            total: 1,
            page: 1,
            pageSize: 20,
          }}
        />,
      ).container.innerHTML,
    ].join("\n");
    const blob = `${JSON.stringify(dto)}\n${html}`;

    expect(dto.buyerSector).toBe("PRIVATE");
    for (const marker of [
      "Example City Council",
      "example-council.gov.uk",
      "find-tender.service.gov.uk",
      "REF-FIXTURE-1",
      "000001-2026",
      "Manchester",
    ]) {
      expect(blob).not.toContain(marker);
    }
  });
});
