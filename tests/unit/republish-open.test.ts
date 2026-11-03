import { afterEach, describe, expect, it, vi } from "vitest";

import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import { ukInfrastructurePipelineSourceRecord } from "@/ingestion/sources/uk-infrastructure-pipeline/seed";
import { createMemoryIngestionStore, type MemoryIngestionState } from "@/ingestion/store/memory";
import type { DataSourceRecord, DealPreviewRecord, DealRecord } from "@/ingestion/store/types";
import { buildPreviewSlug } from "@/lib/deals/public-slug";
import {
  deadlineTbcLabel,
  DEADLINE_TBC_LABEL,
  START_DATE_TBC_LABEL,
} from "@/lib/preview/dates";
import {
  FALLBACK_CATEGORY,
  REASON_ADMIN_HELD,
  REPUBLISH_WORKFLOW_FILE,
  REPUBLISH_WORKFLOW_NAME,
  republishApplyBlockReason,
  runRepublishOpenDeals,
} from "@/lib/jobs/republish-open";
import { scanPreviewLeaks, type LeakScanInput } from "@/lib/redaction/scan";

const forceLeak = vi.hoisted(() => new Set<string>());

vi.mock("@/ingestion/preview/generate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ingestion/preview/generate")>();
  return {
    ...actual,
    async generatePreviewDraft(
      ...args: Parameters<typeof actual.generatePreviewDraft>
    ) {
      const context = args[0];
      const draft = await actual.generatePreviewDraft(...args);
      if (!forceLeak.has(context.deal.id)) {
        return draft;
      }
      return {
        ...draft,
        previewTitle: "Example City Council facilities",
        previewSummary: "https://www.find-tender.service.gov.uk/Notice/000001-2026",
        requirementsPreview: [],
        relevanceTags: [],
        leakageRisk: "HIGH" as const,
        findings: [
          {
            code: "URL" as const,
            risk: "HIGH" as const,
            detail: "seeded leak",
            token: "https://www.find-tender.service.gov.uk/Notice/000001-2026",
          },
        ],
      };
    },
  };
});

const NOW = new Date("2026-09-15T12:00:00.000Z");
const FUTURE_DEADLINE = "2026-10-01T12:00:00.000Z";
const APPLY_ENV = {
  DEALATLAS_REPUBLISH_APPLY: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
};

function dealId(n: number): string {
  return `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

type Store = ReturnType<typeof createMemoryIngestionStore> & MemoryIngestionState;

function storeWith(source: DataSourceRecord = findATenderSourceRecord({ id: "source-fat" })): Store {
  return createMemoryIngestionStore({ sources: [source] }) as Store;
}

async function seedDeal(
  store: Store,
  input: {
    id?: string;
    sourceId?: string;
    status?: DealRecord["status"];
    stage?: DealRecord["stage"];
    deadline?: string | null;
    mainCategory?: string | null;
    sourceTitle?: string;
  } = {},
): Promise<string> {
  const id = input.id ?? dealId(1);
  await store.createDeal({
    id,
    primarySourceId: input.sourceId ?? "source-fat",
    externalPrimaryId: `ext-${id}`,
    ocid: null,
    reference: null,
    sourceTitle: input.sourceTitle ?? "Zebra notice 88421",
    sourceDescription: null,
    buyerOrganizationId: null,
    dealType: "PUBLIC_TENDER",
    buyerSector: "PUBLIC",
    stage: input.stage ?? "LIVE",
    status: input.status ?? "OPEN",
    mainCategory: input.mainCategory === undefined ? "Facilities" : input.mainCategory,
    procurementMethod: null,
    specialRegime: null,
    currency: "GBP",
    valueMinExVat: null,
    valueMaxExVat: null,
    exactValueText: null,
    exactLocationText: null,
    enquiryDeadline: null,
    submissionDeadline: input.deadline === undefined ? FUTURE_DEADLINE : input.deadline,
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
    lastVerifiedAt: null,
    dataQualityScore: null,
  });
  return id;
}

const DEFAULT_TITLE = "Facilities public tender for a public organisation";

function seedPreview(
  store: Store,
  id: string,
  overrides: Partial<DealPreviewRecord> = {},
): DealPreviewRecord {
  const title = overrides.previewTitle ?? DEFAULT_TITLE;
  const row: DealPreviewRecord = {
    dealId: id,
    slug: overrides.slug ?? buildPreviewSlug(title, "abcd1234"),
    previewTitle: title,
    previewSummary:
      "A public organisation is procuring facilities through a public tender.",
    dealType: "PUBLIC_TENDER",
    buyerSector: "PUBLIC",
    stage: "LIVE",
    status: "OPEN",
    mainCategory: "Facilities",
    broadRegion: "Nationwide",
    valueBand: "Undisclosed",
    deadlineBand: "More than 30 days",
    durationBand: "Not disclosed",
    smeSuitability: "UNKNOWN",
    bidComplexity: "UNKNOWN",
    competitionLevel: "UNKNOWN",
    requirementsPreview: [],
    relevanceTags: [],
    freshnessLabel: null,
    leakageRisk: "LOW",
    isPublished: false,
    unpublishedByAdmin: false,
    ...overrides,
  };
  store.previews.push(row);
  return row;
}

function previewFor(store: Store, id: string): DealPreviewRecord {
  const preview = store.previews.find((item) => item.dealId === id);
  if (!preview) {
    throw new Error(`missing preview ${id}`);
  }
  return preview;
}

function snapshot(store: Store) {
  return {
    previews: JSON.stringify(store.previews),
    insights: JSON.stringify(store.insights),
    runs: JSON.stringify(store.previewRuns),
    hashes: [...store.retiredSlugHashes],
  };
}

afterEach(() => {
  forceLeak.clear();
});

describe("republish open deals", () => {
  it("dry-run is the default and makes zero writes", async () => {
    const store = storeWith();
    const id = await seedDeal(store);
    seedPreview(store, id);
    const before = snapshot(store);

    const result = await runRepublishOpenDeals({ store, now: NOW, env: {} });

    expect(result.mode).toBe("dry-run");
    expect(result.buckets.other).toEqual({
      candidates: 1,
      would_publish: 1,
      still_held: {},
    });
    expect(snapshot(store)).toEqual(before);
  });

  it("keeps a leak HIGH preview unpublished after regeneration", async () => {
    const store = storeWith();
    const id = await seedDeal(store);
    seedPreview(store, id, { leakageRisk: "HIGH" });
    forceLeak.add(id);

    const result = await runRepublishOpenDeals({
      store,
      apply: true,
      now: NOW,
      env: APPLY_ENV,
    });

    expect(result.buckets.leak_HIGH.candidates).toBe(1);
    expect(result.buckets.leak_HIGH.would_publish).toBe(0);
    expect(result.buckets.leak_HIGH.still_held).toEqual({ leak_HIGH: 1 });
    const preview = previewFor(store, id);
    expect(preview.leakageRisk).toBe("HIGH");
    expect(preview.isPublished).toBe(false);
  });

  it("re-runs the leak gate for buckets that normally pass", async () => {
    const store = storeWith();
    const id = await seedDeal(store);
    seedPreview(store, id, {
      previewSummary:
        "Contact the buyer at https://www.find-tender.service.gov.uk/Notice/000001-2026",
    });
    forceLeak.add(id);

    const result = await runRepublishOpenDeals({
      store,
      apply: true,
      now: NOW,
      env: APPLY_ENV,
    });

    expect(result.buckets.other.candidates).toBe(1);
    expect(result.buckets.other.would_publish).toBe(0);
    expect(result.buckets.other.still_held).toEqual({ leak_HIGH: 1 });
    expect(previewFor(store, id).isPublished).toBe(false);
  });

  it("publishes after a regeneration clears the leaks", async () => {
    const store = storeWith();
    const id = await seedDeal(store);
    seedPreview(store, id, {
      leakageRisk: "HIGH",
      previewTitle: "Legacy council notice copy",
      slug: "dark-slug-cccc3333",
    });

    const result = await runRepublishOpenDeals({
      store,
      apply: true,
      now: NOW,
      env: APPLY_ENV,
    });

    expect(result.buckets.leak_HIGH.candidates).toBe(1);
    expect(result.buckets.leak_HIGH.would_publish).toBe(1);
    expect(result.buckets.leak_HIGH.still_held).toEqual({});
    const preview = previewFor(store, id);
    expect(preview.leakageRisk).toBe("LOW");
    expect(preview.isPublished).toBe(true);
    expect(preview.slug).not.toBe("dark-slug-cccc3333");
  });

  it("uses Start date TBC for UKIP and Deadline TBC elsewhere", async () => {
    expect(deadlineTbcLabel("uk-infrastructure-pipeline")).toBe(START_DATE_TBC_LABEL);
    expect(deadlineTbcLabel("find-a-tender")).toBe(DEADLINE_TBC_LABEL);
    expect(START_DATE_TBC_LABEL).toBe("Start date TBC");
    expect(DEADLINE_TBC_LABEL).toBe("Deadline TBC");

    const store = storeWith(
      ukInfrastructurePipelineSourceRecord({ id: "source-ukip" }),
    );
    const id = await seedDeal(store, {
      sourceId: "source-ukip",
      deadline: null,
      mainCategory: "Facilities",
    });
    seedPreview(store, id, { deadlineBand: "Upcoming / date not yet fixed" });

    const result = await runRepublishOpenDeals({
      store,
      apply: true,
      now: NOW,
      env: APPLY_ENV,
    });

    expect(result.buckets.no_deadline.candidates).toBe(1);
    expect(result.buckets.no_deadline.would_publish).toBe(1);
    expect(result.deals[0]?.deadlineLabel).toBe(START_DATE_TBC_LABEL);
    expect(previewFor(store, id).deadlineBand).toBe(START_DATE_TBC_LABEL);
  });

  it("uses the existing fallback category for a missing category", async () => {
    const store = storeWith();
    const id = await seedDeal(store, { mainCategory: null });
    seedPreview(store, id, { mainCategory: null });

    const result = await runRepublishOpenDeals({
      store,
      apply: true,
      now: NOW,
      env: APPLY_ENV,
    });

    expect(result.buckets.no_category.candidates).toBe(1);
    expect(result.buckets.no_category.would_publish).toBe(1);
    expect(FALLBACK_CATEGORY).toBe("Other");
    expect(previewFor(store, id).mainCategory).toBe(FALLBACK_CATEGORY);
  });

  it("is idempotent: a second apply publishes nothing new", async () => {
    const store = storeWith();
    const id = await seedDeal(store);
    seedPreview(store, id);

    const first = await runRepublishOpenDeals({
      store,
      apply: true,
      now: NOW,
      env: APPLY_ENV,
    });
    expect(first.buckets.other.would_publish).toBe(1);
    expect(previewFor(store, id).isPublished).toBe(true);

    const second = await runRepublishOpenDeals({
      store,
      apply: true,
      now: NOW,
      env: APPLY_ENV,
    });
    expect(second.buckets.other.candidates).toBe(0);
    expect(second.buckets.other.would_publish).toBe(0);
  });

  it("excludes admin-held previews by default and includes them on request", async () => {
    const store = storeWith();
    const id = await seedDeal(store);
    seedPreview(store, id, { unpublishedByAdmin: true });

    const held = await runRepublishOpenDeals({ store, now: NOW, env: {} });
    expect(held.buckets.admin_unpublished.candidates).toBe(1);
    expect(held.buckets.admin_unpublished.would_publish).toBe(0);
    expect(held.buckets.admin_unpublished.still_held).toEqual({
      [REASON_ADMIN_HELD]: 1,
    });
    expect(previewFor(store, id).isPublished).toBe(false);

    const included = await runRepublishOpenDeals({
      store,
      apply: true,
      includeAdmin: true,
      now: NOW,
      env: APPLY_ENV,
    });
    expect(included.buckets.admin_unpublished.would_publish).toBe(1);
    const preview = previewFor(store, id);
    expect(preview.unpublishedByAdmin).toBe(false);
    expect(preview.isPublished).toBe(true);
  });

  it("refuses apply without the explicit environment confirmation", () => {
    expect(republishApplyBlockReason({}, true)).toMatch(
      /DEALATLAS_REPUBLISH_APPLY/,
    );
    expect(republishApplyBlockReason(APPLY_ENV, true)).toBeNull();
    expect(
      republishApplyBlockReason(
        {
          ...APPLY_ENV,
          DEALATLAS_PROD_SUPABASE_URL: "https://abcdefgh.supabase.co",
          NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
        },
        true,
      ),
    ).toMatch(/production/);
  });

  it("allows a production apply only from the confirmed GitHub workflow", () => {
    const prod = {
      DEALATLAS_REPUBLISH_APPLY: "1",
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
      DEALATLAS_PROD_SUPABASE_URL: "https://abcdefgh.supabase.co",
    };
    expect(republishApplyBlockReason(prod, true)).toMatch(/production/);
    expect(
      republishApplyBlockReason(
        {
          ...prod,
          GITHUB_ACTIONS: "true",
          GITHUB_WORKFLOW: "some-other-workflow",
          DEALATLAS_REPUBLISH_CONFIRM: "PUBLISH",
        },
        true,
      ),
    ).toMatch(/production/);
    expect(
      republishApplyBlockReason(
        {
          ...prod,
          GITHUB_ACTIONS: "true",
          GITHUB_WORKFLOW: REPUBLISH_WORKFLOW_NAME,
          DEALATLAS_REPUBLISH_CONFIRM: "publish",
        },
        true,
      ),
    ).toMatch(/production/);
    expect(
      republishApplyBlockReason(
        {
          ...prod,
          GITHUB_ACTIONS: "true",
          GITHUB_WORKFLOW: REPUBLISH_WORKFLOW_NAME,
          DEALATLAS_REPUBLISH_CONFIRM: "PUBLISH",
        },
        true,
      ),
    ).toBeNull();
    expect(
      republishApplyBlockReason(
        {
          ...prod,
          GITHUB_ACTIONS: "true",
          GITHUB_WORKFLOW: REPUBLISH_WORKFLOW_FILE,
          DEALATLAS_REPUBLISH_CONFIRM: "PUBLISH",
        },
        true,
      ),
    ).toBeNull();
  });

  it("cleans buyer names and URLs from a leak-held preview before publishing", async () => {
    const store = storeWith();
    const id = await seedDeal(store);
    seedPreview(store, id, {
      leakageRisk: "HIGH",
      previewTitle: "Facilities public tender for Example City Council",
      previewSummary:
        "Example City Council is procuring facilities. Apply at https://example.gov.uk/Notice/123456-2026 or email buyer@example.gov.uk.",
    });

    const dry = await runRepublishOpenDeals({ store, now: NOW, env: {} });
    expect(dry.counts.would_publish).toBe(1);
    expect(dry.counts.leak_held_cleaned_passing).toBe(1);
    expect(dry.counts.still_held).toEqual({});
    expect(dry.deals[0]?.action).toBe("sanitize_publish");

    const applied = await runRepublishOpenDeals({
      store,
      apply: true,
      now: NOW,
      env: APPLY_ENV,
    });
    expect(applied.counts.would_publish).toBe(1);

    const preview = previewFor(store, id);
    expect(preview.isPublished).toBe(true);
    expect(preview.leakageRisk).toBe("LOW");
    const combined = `${preview.previewTitle} ${preview.previewSummary}`;
    expect(combined).not.toContain("Example City Council");
    expect(combined).not.toContain("https://");
    expect(combined).not.toContain("buyer@example.gov.uk");
    expect(combined).not.toContain("123456-2026");
  });

  it("keeps an uncleanable leak-held preview held", async () => {
    const store = storeWith();
    const id = await seedDeal(store);
    seedPreview(store, id, {
      leakageRisk: "HIGH",
      previewTitle: "Example City Council",
      previewSummary: "https://example.gov.uk/Notice/123456-2026",
    });
    forceLeak.add(id);

    const result = await runRepublishOpenDeals({
      store,
      apply: true,
      now: NOW,
      env: APPLY_ENV,
    });

    expect(result.counts.would_publish).toBe(0);
    expect(result.counts.leak_held_cleaned_passing).toBe(0);
    expect(result.counts.still_held).toEqual({ leak_HIGH: 1 });
    expect(previewFor(store, id).isPublished).toBe(false);
  });

  it("does not change the leak-check rules for raw text", () => {
    const raw: LeakScanInput = {
      previewTitle: "Facilities public tender",
      previewSummary:
        "Example City Council is procuring facilities at https://example.gov.uk/Notice/123456-2026",
      requirementsPreview: [],
      sourceTitle: "Facilities notice",
      sourceDescription: null,
      ocid: null,
      reference: null,
      externalPrimaryId: null,
      sourceUrl: null,
      applicationUrl: null,
      sourceName: null,
      sourceKey: null,
      buyerName: "Example City Council",
      buyerAliases: [],
      buyerDomain: "example.gov.uk",
      buyerEmail: null,
      buyerPhone: null,
      exactValueText: null,
      valueMinExVat: null,
      valueMaxExVat: null,
      submissionDeadline: null,
      exactLocationText: null,
    };
    expect(scanPreviewLeaks(raw).risk).toBe("HIGH");
  });
});
