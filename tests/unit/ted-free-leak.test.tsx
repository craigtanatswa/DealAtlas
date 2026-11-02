// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DealPaidDetail } from "@/components/deals/deal-paid-detail";
import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { DealProCard } from "@/components/deals/deal-pro-card";
import { DealSearchResults } from "@/components/deals/deal-search-results";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import { runIngestion } from "@/ingestion/core/pipeline";
import { createTedAdapter } from "@/ingestion/sources/ted/adapter";
import { tedSourceRecord } from "@/ingestion/sources/ted/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import {
  toPaidDealDto,
  type PaidDealMappingInput,
} from "@/lib/deals/paid-dto";
import { toPublicDealPreview, type PreviewDtoFields } from "@/lib/search/dto";

afterEach(cleanup);

const NOTICE_ID = "654321-2026";

const TED_ATTRIBUTION_TEXT =
  "Source: Tenders Electronic Daily (TED), Publications Office of the European Union. © European Union. Reused under Commission Decision 2011/833/EU.";

const ROW = {
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
    "financial capacity evidence",
    "source_key: ted",
    "source_name: Tenders Electronic Daily",
    `notice_id: ${NOTICE_ID}`,
    `attribution: ${TED_ATTRIBUTION_TEXT}`,
  ],
  relevance_tags: [],
  freshness_label: null,
  source_key: "ted",
  sourceKey: "ted",
  source: { source_key: "ted", name: "Tenders Electronic Daily" },
  source_name: "Tenders Electronic Daily",
  source_url: `https://ted.europa.eu/notice/${NOTICE_ID}`,
  notice_id: NOTICE_ID,
  noticeIdentifier: NOTICE_ID,
  eu: true,
  isEu: true,
  ted: true,
  attribution: TED_ATTRIBUTION_TEXT,
} as PreviewDtoFields & Record<string, unknown>;

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, keys);
    }
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("TED attribution never reaches free or anonymous surfaces", () => {
  it("renders free components without TED text, notice ids, or source keys", () => {
    const dto = toPublicDealPreview(ROW);

    const html = [
      render(
        <DealPreviewDetail
          deal={dto}
          unlock={{
            mode: "anonymous",
            loginHref: "/login",
            revealHref: "/app",
            returnTo: `/deals/${dto.slug}`,
          }}
        />,
      ).container.innerHTML,
      render(
        <DealPreviewDetail
          deal={dto}
          unlock={{
            mode: "free",
            revealHref: "/app",
            returnTo: `/deals/${dto.slug}`,
          }}
        />,
      ).container.innerHTML,
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
      render(<UnlockPanel mode="anonymous" />).container.innerHTML,
      render(<UnlockPanel mode="free" />).container.innerHTML,
      render(
        <DealProCard mode="anonymous" alertsHref="/app/alerts" />,
      ).container.innerHTML,
      render(<DealProCard mode="free" alertsHref="/app/alerts" />).container
        .innerHTML,
    ].join("\n");

    expect(html).toContain(dto.previewTitle);
    expect(html).not.toMatch(/\bTED\b/);
    expect(html).not.toMatch(/European Union/i);
    expect(html).not.toMatch(/ted\.europa/i);
    expect(html).not.toMatch(/Tenders Electronic Daily/i);
    expect(html).not.toContain(NOTICE_ID);
    expect(JSON.stringify(dto)).not.toContain(NOTICE_ID);
  });

  it("exposes no TED or source keys on the public preview DTO", () => {
    const dto = toPublicDealPreview(ROW);
    const keys = collectKeys(JSON.parse(JSON.stringify(dto)));

    for (const key of [
      "source",
      "sourceKey",
      "source_key",
      "eu",
      "isEu",
      "ted",
      "attribution",
    ]) {
      expect(keys).not.toContain(key);
    }
  });
});

describe("TED attribution source boundary", () => {
  it("is only imported or referenced by the paid detail and the attribution component", () => {
    const componentsDir = path.join(process.cwd(), "components");
    const allowed = new Set([
      "deals/deal-paid-detail.tsx",
      "deals/ted-attribution.tsx",
    ]);

    for (const file of sourceFiles(componentsDir)) {
      const relative = path
        .relative(componentsDir, file)
        .split(path.sep)
        .join("/");
      if (allowed.has(relative)) {
        continue;
      }

      const source = fs.readFileSync(file, "utf8");
      expect(source, relative).not.toContain("ted-attribution");
      expect(source, relative).not.toContain("TED_SOURCE_KEY");
    }
  });
});

const TED_NOW = new Date("2026-10-14T12:00:00.000Z");

function privateTedNotice(): Record<string, unknown> {
  const page = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/ingestion/ted/open.json"),
      "utf8",
    ),
  ) as { notices: Record<string, unknown>[] };
  return { ...page.notices[0], "buyer-legal-type": ["org-sub"] };
}

describe("private TED buyers stay out of the free preview", () => {
  it("shows only the country and hides the buyer, domain, URL and reference", async () => {
    const store = createMemoryIngestionStore({
      sources: [tedSourceRecord({ id: "source-ted" })],
    });
    const adapter = createTedAdapter({
      now: () => TED_NOW,
      http: {
        async getJson() {
          throw new Error("TED search is POST");
        },
        async postJson(url) {
          return {
            url,
            status: 200,
            contentType: "application/json",
            body: {
              notices: [privateTedNotice()],
              totalNoticeCount: 1,
            },
            rawText: "{}",
          };
        },
      },
    });
    const result = await runIngestion({
      sourceKey: "ted",
      store,
      adapter,
      now: TED_NOW,
      limit: 1,
      triggerType: "TEST",
      updatedFrom: "2026-10-07T00:00:00",
      updatedTo: "2026-10-14T00:00:00",
    });

    expect(result.counters.new).toBe(1);
    const deal = store.deals[0]!;
    expect(deal.buyerSector).toBe("PRIVATE");
    expect(deal.exactLocationText).toBe("Sweden");
    expect(deal.exactLocationText).not.toContain("Stockholm");

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
      "Canary Municipal Works",
      "canary-buyer.example",
      "ted.europa.eu",
      "REF-CANARY-42",
      "999111-2026",
      "Stockholm",
    ]) {
      expect(blob).not.toContain(marker);
    }
  });
});

const MALTA_NOTICE = {
  id: "777111-2026",
  title: "Portable water testing kits for a harbour authority",
  buyerName: "Harbour Works Directorate",
  town: "Valletta",
  postcode: "VLT 1117",
  street: "Triq il-Merkanti 12",
  country3: "MLT",
  reference: "MT-HARBOUR-42",
} as const;

const GERMANY_NOTICE = {
  id: "777222-2026",
  title: "Digital records platform for a regional authority",
  buyerName: "Bavaria Digital Agency",
  town: "Muenchen",
  postcode: "80331",
  street: "Marienplatz 8",
  country3: "DEU",
  reference: "DE-BAVARIA-84",
} as const;

function addressedTedNotice(input: {
  id: string;
  title: string;
  buyerName: string;
  town: string;
  postcode: string;
  street: string;
  country3: string;
  reference: string;
}): Record<string, unknown> {
  const page = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/ingestion/ted/open.json"),
      "utf8",
    ),
  ) as { notices: Record<string, unknown>[] };
  return {
    ...page.notices[0],
    "publication-number": input.id,
    "notice-title": { eng: input.title },
    "buyer-name": { eng: [input.buyerName] },
    "buyer-country": [input.country3],
    "buyer-city": { eng: [input.town] },
    "buyer-street": { eng: [input.street] },
    "buyer-post-code": [input.postcode],
    "buyer-internet-address": `https://buyer-${input.id}.example/apply`,
    "internal-identifier-proc": input.reference,
    "place-of-performance": [input.country3],
    "description-proc": `${input.title} for the authority.`,
    "description-lot": { eng: [`${input.title} for the authority.`] },
    "document-url-lot": [`https://documents.example/${input.id}.pdf`],
    links: {
      html: {
        ENG: `https://ted.europa.eu/en/notice/-/detail/${input.id}`,
      },
    },
  };
}

function paidInputFromStore(
  store: ReturnType<typeof createMemoryIngestionStore>,
  index: number,
): PaidDealMappingInput {
  const deal = store.deals[index]!;
  const buyer =
    store.organizations.find((item) => item.id === deal.buyerOrganizationId) ??
    null;
  const source =
    store.sources.find((item) => item.id === deal.primarySourceId) ?? null;
  return {
    deal: {
      id: deal.id,
      source_title: deal.sourceTitle,
      source_description: deal.sourceDescription,
      reference: deal.reference,
      ocid: deal.ocid,
      external_primary_id: deal.externalPrimaryId,
      deal_type: deal.dealType,
      buyer_sector: deal.buyerSector,
      stage: deal.stage,
      status: deal.status,
      main_category: deal.mainCategory,
      procurement_method: deal.procurementMethod,
      special_regime: deal.specialRegime,
      currency: deal.currency,
      value_min_ex_vat: deal.valueMinExVat,
      value_max_ex_vat: deal.valueMaxExVat,
      exact_value_text: deal.exactValueText,
      exact_location_text: deal.exactLocationText,
      enquiry_deadline: deal.enquiryDeadline,
      submission_deadline: deal.submissionDeadline,
      award_decision_date: deal.awardDecisionDate,
      contract_start_date: deal.contractStartDate,
      contract_end_date: deal.contractEndDate,
      extension_end_date: deal.extensionEndDate,
      next_procurement_date: deal.nextProcurementDate,
      estimated_renewal_date: deal.estimatedRenewalDate,
      sme_suitable: deal.smeSuitable,
      vcse_suitable: deal.vcseSuitable,
      source_url: deal.sourceUrl,
      application_url: deal.applicationUrl,
      first_published_at: deal.firstPublishedAt,
      latest_source_at: deal.latestSourceAt,
    },
    buyer: buyer
      ? {
          id: buyer.id,
          canonical_name: buyer.canonicalName,
          website: buyer.website,
          domain: buyer.domain,
          email: buyer.email,
          phone: buyer.phone,
          city: buyer.city,
          region: buyer.region,
          country_code: buyer.countryCode,
        }
      : null,
    source: source
      ? {
          id: source.id,
          name: source.name,
          source_key: source.sourceKey,
          source_type: source.sourceType,
          base_url: source.baseUrl,
          reuse_status: source.reuseStatus,
          licence_name: source.licenceName,
          licence_url: source.licenceUrl,
          terms_url: source.termsUrl,
        }
      : null,
    notices: store.notices
      .filter((notice) => notice.dealId === deal.id)
      .map((notice) => ({
        id: notice.id,
        notice_identifier: notice.noticeIdentifier,
        notice_type: notice.noticeType,
        notice_stage: notice.noticeStage,
        source_url: notice.sourceUrl,
        published_at: notice.publishedAt,
        modified_at: notice.modifiedAt,
        is_current_version: notice.isCurrentVersion,
      })),
    documents: [],
  };
}

describe("TED address fields and bucketed country regions", () => {
  it("hides buyer addresses from free surfaces and shows them to Pro", async () => {
    const notices = [
      addressedTedNotice(MALTA_NOTICE),
      addressedTedNotice(GERMANY_NOTICE),
    ];
    const store = createMemoryIngestionStore({
      sources: [tedSourceRecord({ id: "source-ted" })],
    });
    const adapter = createTedAdapter({
      now: () => TED_NOW,
      http: {
        async getJson() {
          throw new Error("TED search is POST");
        },
        async postJson(url) {
          return {
            url,
            status: 200,
            contentType: "application/json",
            body: {
              notices,
              totalNoticeCount: notices.length,
            },
            rawText: "{}",
          };
        },
      },
    });
    const result = await runIngestion({
      sourceKey: "ted",
      store,
      adapter,
      now: TED_NOW,
      limit: 2,
      triggerType: "TEST",
      updatedFrom: "2026-10-07T00:00:00",
      updatedTo: "2026-10-14T00:00:00",
    });

    expect(result.counters.new).toBe(2);
    expect(store.previews).toHaveLength(2);
    const dtos = store.previews.map((preview) =>
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
    const maltaDto = dtos[0]!;
    const germanyDto = dtos[1]!;
    expect(maltaDto.broadRegion).toBe("Europe (other)");
    expect(germanyDto.broadRegion).toBe("Germany");

    const freeHtml = [
      render(
        <DealPreviewDetail
          deal={maltaDto}
          unlock={{
            mode: "anonymous",
            loginHref: "/login",
            revealHref: "/app",
            returnTo: `/deals/${maltaDto.slug}`,
          }}
        />,
      ).container.innerHTML,
      render(
        <DealPreviewDetail
          deal={maltaDto}
          unlock={{
            mode: "free",
            revealHref: "/app",
            returnTo: `/deals/${maltaDto.slug}`,
          }}
        />,
      ).container.innerHTML,
      render(
        <DealPreviewDetail
          deal={germanyDto}
          unlock={{
            mode: "anonymous",
            loginHref: "/login",
            revealHref: "/app",
            returnTo: `/deals/${germanyDto.slug}`,
          }}
        />,
      ).container.innerHTML,
      render(
        <DealSearchResults
          filters={{ page: 1, limit: 20 }}
          result={{
            items: dtos.map((preview) => ({ preview, match: null })),
            total: dtos.length,
            page: 1,
            pageSize: 20,
          }}
        />,
      ).container.innerHTML,
      render(<UnlockPanel mode="anonymous" />).container.innerHTML,
      render(<UnlockPanel mode="free" />).container.innerHTML,
      render(
        <DealProCard mode="anonymous" alertsHref="/app/alerts" />,
      ).container.innerHTML,
      render(<DealProCard mode="free" alertsHref="/app/alerts" />).container
        .innerHTML,
    ].join("\n");
    const freeBlob = `${JSON.stringify(dtos)}\n${freeHtml}`;

    for (const marker of [
      MALTA_NOTICE.buyerName,
      MALTA_NOTICE.town,
      MALTA_NOTICE.postcode,
      MALTA_NOTICE.street,
      MALTA_NOTICE.id,
      MALTA_NOTICE.reference,
      `https://ted.europa.eu/en/notice/-/detail/${MALTA_NOTICE.id}`,
      GERMANY_NOTICE.buyerName,
      GERMANY_NOTICE.town,
      GERMANY_NOTICE.postcode,
      GERMANY_NOTICE.street,
      GERMANY_NOTICE.id,
      GERMANY_NOTICE.reference,
      `https://ted.europa.eu/en/notice/-/detail/${GERMANY_NOTICE.id}`,
    ]) {
      expect(freeBlob).not.toContain(marker);
    }

    const paidDto = toPaidDealDto(paidInputFromStore(store, 0));
    const proHtml = render(<DealPaidDetail deal={paidDto} />).container.innerHTML;
    expect(proHtml).toContain(MALTA_NOTICE.buyerName);
    expect(proHtml).toContain(MALTA_NOTICE.reference);
    expect(proHtml).toContain(
      `https://ted.europa.eu/en/notice/-/detail/${MALTA_NOTICE.id}`,
    );
  });
});
