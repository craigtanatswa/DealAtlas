import { describe, expect, it } from "vitest";

import {
  CATEGORY_BACKFILL_APPLY_ENV,
  categoryBackfillBlockReason,
  runCategoryBackfill,
} from "@/lib/jobs/backfill-categories";
import {
  createMemoryIngestionStore,
  type MemoryIngestionState,
} from "@/ingestion/store/memory";
import type { DealPreviewRecord } from "@/ingestion/store/types";

const CATEGORIES = [
  { slug: "facilities-property", name: "Facilities & Property" },
  { slug: "manufacturing-industrial", name: "Manufacturing & Industrial" },
  { slug: "transport-logistics", name: "Transport & Logistics" },
  { slug: "technology", name: "Technology" },
  { slug: "healthcare", name: "Healthcare" },
  { slug: "other", name: "Other" },
];

const APPLY_ENV = {
  [CATEGORY_BACKFILL_APPLY_ENV]: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
};

type Store = ReturnType<typeof createMemoryIngestionStore> & MemoryIngestionState;

function storeWithCategories(): Store {
  return createMemoryIngestionStore({
    categories: CATEGORIES.map((item) => ({ ...item, id: `cat-${item.slug}` })),
  }) as Store;
}

function dealId(n: number): string {
  return `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

async function seedDeal(
  store: Store,
  input: {
    id: string;
    mainCategory?: string | null;
    sourceTitle?: string;
  },
): Promise<string> {
  await store.createDeal({
    id: input.id,
    primarySourceId: null,
    externalPrimaryId: `ext-${input.id}`,
    ocid: null,
    reference: null,
    sourceTitle: input.sourceTitle ?? `Stored notice ${input.id}`,
    sourceDescription: null,
    buyerOrganizationId: null,
    dealType: "PUBLIC_TENDER",
    buyerSector: "PUBLIC",
    stage: "LIVE",
    status: "OPEN",
    mainCategory: input.mainCategory === undefined ? null : input.mainCategory,
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
    lastVerifiedAt: null,
    dataQualityScore: null,
  });
  return input.id;
}

function seedPreview(
  store: Store,
  dealIdValue: string,
  overrides: Partial<DealPreviewRecord> = {},
): DealPreviewRecord {
  const row: DealPreviewRecord = {
    dealId: dealIdValue,
    slug: `stored-notice-${dealIdValue.slice(-4)}`,
    previewTitle: "Stored preview title",
    previewSummary: "Stored preview summary",
    dealType: "PUBLIC_TENDER",
    buyerSector: "PUBLIC",
    stage: "LIVE",
    status: "OPEN",
    mainCategory: null,
    broadRegion: "Nationwide",
    valueBand: "Undisclosed",
    deadlineBand: "Deadline TBC",
    durationBand: "Not disclosed",
    smeSuitability: "UNKNOWN",
    bidComplexity: "UNKNOWN",
    competitionLevel: "UNKNOWN",
    requirementsPreview: ["Stored requirement"],
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

async function seedClassification(
  store: Store,
  input: {
    dealId: string;
    cpvCode: string;
    isPrimary: boolean;
    categoryId?: string | null;
  },
): Promise<void> {
  await store.insertClassification({
    dealId: input.dealId,
    cpvCode: input.cpvCode,
    categoryId: input.categoryId ?? null,
    isPrimary: input.isPrimary,
  });
}

function snapshot(store: Store) {
  return {
    deals: JSON.stringify(store.deals),
    previews: JSON.stringify(store.previews),
    classifications: JSON.stringify(store.classifications),
  };
}

describe("category backfill", () => {
  it("dry-run reports counts and makes no writes", async () => {
    const store = storeWithCategories();
    const id = await seedDeal(store, { id: dealId(1) });
    seedPreview(store, id);
    await seedClassification(store, { dealId: id, cpvCode: "50000000-5", isPrimary: true });
    const before = snapshot(store);

    const result = await runCategoryBackfill({
      store,
      dealIds: [id],
      env: {},
    });

    expect(result.mode).toBe("dry-run");
    expect(result.deals).toEqual({
      scanned: 1,
      would_change: 1,
      reasons: {
        expanded_map: 1,
        secondary_cpv: 0,
        nature_fallback: 0,
        coarse_upgraded: 0,
      },
      skipped_already_set: 0,
      still_blank: 0,
    });
    expect(result.previews.would_change).toBe(1);
    expect(result.classifications).toEqual({
      scanned: 1,
      would_update: 1,
      skipped_already_set: 0,
      still_unmapped: 0,
    });
    expect(snapshot(store)).toEqual(before);
  });

  it("apply updates only the category fields", async () => {
    const store = storeWithCategories();
    const id = await seedDeal(store, { id: dealId(2), mainCategory: "services" });
    const preview = seedPreview(store, id, {
      mainCategory: "services",
      previewTitle: "A preserved preview title",
      previewSummary: "A preserved preview summary",
      requirementsPreview: ["A preserved requirement"],
      leakageRisk: "HIGH",
      isPublished: false,
    });
    await seedClassification(store, { dealId: id, cpvCode: "42000000-1", isPrimary: true });

    const result = await runCategoryBackfill({
      store,
      apply: true,
      dealIds: [id],
      env: APPLY_ENV,
    });

    expect(result.mode).toBe("apply");
    expect(result.deals.reasons.coarse_upgraded).toBe(1);
    expect(result.previews.reasons.coarse_upgraded).toBe(1);
    expect(store.deals[0]?.mainCategory).toBe("Manufacturing & Industrial");
    const savedPreview = store.previews[0]!;
    expect(savedPreview.mainCategory).toBe("Manufacturing & Industrial");
    expect(savedPreview.previewTitle).toBe(preview.previewTitle);
    expect(savedPreview.previewSummary).toBe(preview.previewSummary);
    expect(savedPreview.requirementsPreview).toEqual(preview.requirementsPreview);
    expect(savedPreview.leakageRisk).toBe("HIGH");
    expect(savedPreview.isPublished).toBe(false);
    expect(store.classifications[0]?.categoryId).toBe("cat-manufacturing-industrial");
  });

  it("leaves an already-specific category alone", async () => {
    const store = storeWithCategories();
    const id = await seedDeal(store, { id: dealId(3), mainCategory: "Other" });
    seedPreview(store, id, { mainCategory: "Energy" });
    await seedClassification(store, { dealId: id, cpvCode: "50000000-5", isPrimary: true });

    const result = await runCategoryBackfill({
      store,
      apply: true,
      dealIds: [id],
      env: APPLY_ENV,
    });

    expect(result.deals.skipped_already_set).toBe(1);
    expect(result.previews.skipped_already_set).toBe(1);
    expect(result.deals.reasons.expanded_map).toBe(0);
    expect(store.deals[0]?.mainCategory).toBe("Other");
    expect(store.previews[0]?.mainCategory).toBe("Energy");
    expect(store.classifications[0]?.categoryId).toBe("cat-facilities-property");
  });

  it("uses a mapped secondary CPV when the primary is unmapped", async () => {
    const store = storeWithCategories();
    const id = await seedDeal(store, { id: dealId(4) });
    seedPreview(store, id);
    await seedClassification(store, { dealId: id, cpvCode: "99000000-1", isPrimary: true });
    await seedClassification(store, { dealId: id, cpvCode: "34000000-1", isPrimary: false });

    const result = await runCategoryBackfill({
      store,
      apply: true,
      dealIds: [id],
      env: APPLY_ENV,
    });

    expect(result.deals.reasons.secondary_cpv).toBe(1);
    expect(result.previews.reasons.secondary_cpv).toBe(1);
    expect(result.classifications.scanned).toBe(2);
    expect(result.classifications.still_unmapped).toBe(1);
    expect(result.classifications.would_update).toBe(1);
    expect(store.deals[0]?.mainCategory).toBe("Transport & Logistics");
    expect(store.previews[0]?.mainCategory).toBe("Transport & Logistics");
    expect(store.classifications[0]?.categoryId).toBeNull();
    expect(store.classifications[1]?.categoryId).toBe("cat-transport-logistics");
  });

  it("fills a blank row from a stored coarse fallback and reports still blank", async () => {
    const store = storeWithCategories();
    const withNature = await seedDeal(store, { id: dealId(5) });
    seedPreview(store, withNature, { mainCategory: "works" });
    const blank = await seedDeal(store, { id: dealId(6) });
    seedPreview(store, blank);

    const result = await runCategoryBackfill({
      store,
      apply: true,
      dealIds: [withNature, blank],
      env: APPLY_ENV,
    });

    expect(result.deals.reasons.nature_fallback).toBe(1);
    expect(result.deals.still_blank).toBe(1);
    expect(result.previews.skipped_already_set).toBe(1);
    expect(result.previews.still_blank).toBe(1);
    expect(store.deals.find((deal) => deal.id === withNature)?.mainCategory).toBe("works");
    expect(store.deals.find((deal) => deal.id === blank)?.mainCategory).toBeNull();
    expect(store.previews.find((item) => item.dealId === blank)?.mainCategory).toBeNull();
  });

  it("refuses apply without the environment flag and never writes", async () => {
    const store = storeWithCategories();
    const id = await seedDeal(store, { id: dealId(7) });
    seedPreview(store, id);
    await seedClassification(store, { dealId: id, cpvCode: "50000000-5", isPrimary: true });
    const before = snapshot(store);

    await expect(
      runCategoryBackfill({ store, apply: true, dealIds: [id], env: {} }),
    ).rejects.toThrow(new RegExp(CATEGORY_BACKFILL_APPLY_ENV));
    expect(snapshot(store)).toEqual(before);
  });

  it("refuses the production project even in dry-run", () => {
    expect(
      categoryBackfillBlockReason(
        {
          NEXT_PUBLIC_SUPABASE_URL: "https://wdcanzikysdsvdlqbrbd.supabase.co",
        },
        false,
      ),
    ).toMatch(/production/);
    expect(
      categoryBackfillBlockReason(
        {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          DEALATLAS_PROD_SUPABASE_URL: "https://example.supabase.co",
        },
        false,
      ),
    ).toMatch(/production/);
    expect(
      categoryBackfillBlockReason(
        { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" },
        false,
      ),
    ).toBeNull();
  });

  it("refuses a remote non-production apply without the remote opt-ins", () => {
    expect(
      categoryBackfillBlockReason(
        {
          [CATEGORY_BACKFILL_APPLY_ENV]: "1",
          NEXT_PUBLIC_SUPABASE_URL: "https://staging.supabase.co",
          DEALATLAS_PROD_SUPABASE_PROJECT_REF: "prodref",
        },
        true,
      ),
    ).toMatch(/non-local/);
  });
});
