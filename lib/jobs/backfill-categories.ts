import {
  categoryFromCpv,
  categoryFromCpvs,
  categoryLabelFromContractNature,
} from "@/ingestion/normalizers/taxonomy";
import type { IngestionStore } from "@/ingestion/store/types";

export const CATEGORY_BACKFILL_APPLY_ENV = "DEALATLAS_CATEGORY_BACKFILL_APPLY";
export const CATEGORY_BACKFILL_ALLOW_REMOTE_ENV =
  "DEALATLAS_CATEGORY_BACKFILL_ALLOW_REMOTE";
export const CATEGORY_BACKFILL_REMOTE_HOST_ENV =
  "DEALATLAS_CATEGORY_BACKFILL_REMOTE_HOST";
export const CATEGORY_BACKFILL_PROD_PROJECT_REF = "wdcanzikysdsvdlqbrbd";

export const CATEGORY_BACKFILL_REASONS = [
  "expanded_map",
  "secondary_cpv",
  "nature_fallback",
  "coarse_upgraded",
] as const;

export type CategoryBackfillReason = (typeof CATEGORY_BACKFILL_REASONS)[number];

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
  "host.docker.internal",
]);

const COARSE_CATEGORIES = new Set(["goods", "services", "works"]);

function safeHost(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    return new URL(value.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isProductionTarget(
  target: string,
  host: string,
  env: Record<string, string | undefined>,
): boolean {
  const normalizedTarget = target.trim().toLowerCase();
  const prodRefs = new Set([CATEGORY_BACKFILL_PROD_PROJECT_REF]);
  const envRef = env.DEALATLAS_PROD_SUPABASE_PROJECT_REF?.trim().toLowerCase();
  if (envRef) {
    prodRefs.add(envRef);
  }
  for (const ref of prodRefs) {
    if (host === ref || host.split(".").includes(ref) || normalizedTarget.includes(ref)) {
      return true;
    }
  }
  const prodHost = safeHost(env.DEALATLAS_PROD_SUPABASE_URL);
  return Boolean(prodHost && host === prodHost);
}

export function categoryBackfillBlockReason(
  env: Record<string, string | undefined>,
  apply = true,
): string | null {
  if (env.VERCEL_ENV === "production" || env.NODE_ENV === "production") {
    return "refusing to run category backfill in a production environment";
  }
  if (apply && env[CATEGORY_BACKFILL_APPLY_ENV]?.trim() !== "1") {
    return `refusing to apply without ${CATEGORY_BACKFILL_APPLY_ENV}=1`;
  }

  const targets = [
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_URL,
    env.DATABASE_URL,
  ].filter((value): value is string => Boolean(value?.trim()));

  if (apply && targets.length === 0) {
    return "refusing to apply category backfill without a database target";
  }

  for (const target of targets) {
    const host = safeHost(target);
    if (!host) {
      return "refusing category backfill because the database target is not a URL";
    }
    if (isProductionTarget(target, host, env)) {
      return `refusing category backfill against the production project ${host}`;
    }
    if (!apply || LOCAL_HOSTS.has(host)) {
      continue;
    }
    if (env[CATEGORY_BACKFILL_ALLOW_REMOTE_ENV]?.trim() !== "1") {
      return `refusing to apply category backfill against non-local database ${host}`;
    }
    if (env[CATEGORY_BACKFILL_REMOTE_HOST_ENV]?.trim().toLowerCase() !== host) {
      return `${CATEGORY_BACKFILL_REMOTE_HOST_ENV} must equal ${host} to allow this remote target`;
    }
    if (
      !env.DEALATLAS_PROD_SUPABASE_URL?.trim() &&
      !env.DEALATLAS_PROD_SUPABASE_PROJECT_REF?.trim()
    ) {
      return "set DEALATLAS_PROD_SUPABASE_URL or DEALATLAS_PROD_SUPABASE_PROJECT_REF so remote targets can be checked against production";
    }
  }

  return null;
}

export type CategoryBackfillFieldCounts = {
  scanned: number;
  would_change: number;
  reasons: Record<CategoryBackfillReason, number>;
  skipped_already_set: number;
  still_blank: number;
};

export type CategoryBackfillClassificationCounts = {
  scanned: number;
  would_update: number;
  skipped_already_set: number;
  still_unmapped: number;
};

export type CategoryBackfillResult = {
  mode: "dry-run" | "apply";
  scanned: number;
  deals: CategoryBackfillFieldCounts;
  previews: CategoryBackfillFieldCounts;
  classifications: CategoryBackfillClassificationCounts;
};

export type CategoryBackfillOptions = {
  store: IngestionStore;
  apply?: boolean;
  env?: Record<string, string | undefined>;
  limit?: number;
  /** When set, only inspect these deals instead of the default database query. */
  dealIds?: string[];
};

type CategoryChangePlan = {
  next: string | null;
  reason: CategoryBackfillReason | null;
  skipped: boolean;
  stillBlank: boolean;
};

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isCoarseCategory(value: string | null): boolean {
  return Boolean(value && COARSE_CATEGORIES.has(value.toLowerCase()));
}

function planCategoryChange(input: {
  current: string | null;
  other: string | null;
  mapped: { slug: string; label: string } | null;
  primaryMapped: boolean;
}): CategoryChangePlan {
  const current = blankToNull(input.current);
  if (current && !isCoarseCategory(current)) {
    return { next: null, reason: null, skipped: true, stillBlank: false };
  }
  if (input.mapped) {
    if (current) {
      return {
        next: input.mapped.label,
        reason: "coarse_upgraded",
        skipped: false,
        stillBlank: false,
      };
    }
    return {
      next: input.mapped.label,
      reason: input.primaryMapped ? "expanded_map" : "secondary_cpv",
      skipped: false,
      stillBlank: false,
    };
  }
  if (!current) {
    const nature = categoryLabelFromContractNature(input.other);
    if (nature) {
      return {
        next: nature,
        reason: "nature_fallback",
        skipped: false,
        stillBlank: false,
      };
    }
    return { next: null, reason: null, skipped: false, stillBlank: true };
  }
  return { next: null, reason: null, skipped: true, stillBlank: false };
}

function emptyFieldCounts(): CategoryBackfillFieldCounts {
  return {
    scanned: 0,
    would_change: 0,
    reasons: Object.fromEntries(
      CATEGORY_BACKFILL_REASONS.map((reason) => [reason, 0]),
    ) as Record<CategoryBackfillReason, number>,
    skipped_already_set: 0,
    still_blank: 0,
  };
}

function tallyField(
  counts: CategoryBackfillFieldCounts,
  plan: CategoryChangePlan,
): void {
  counts.scanned += 1;
  if (plan.next && plan.reason) {
    counts.would_change += 1;
    counts.reasons[plan.reason] += 1;
  } else if (plan.stillBlank) {
    counts.still_blank += 1;
  } else if (plan.skipped) {
    counts.skipped_already_set += 1;
  }
}

export async function runCategoryBackfill(
  input: CategoryBackfillOptions,
): Promise<CategoryBackfillResult> {
  const apply = input.apply === true;
  const env = input.env ?? process.env;
  const blocked = categoryBackfillBlockReason(env, apply);
  if (blocked) {
    throw new Error(blocked);
  }

  const dealIds =
    input.dealIds ??
    (await input.store.listCategoryBackfillDealIds(input.limit));
  const result: CategoryBackfillResult = {
    mode: apply ? "apply" : "dry-run",
    scanned: 0,
    deals: emptyFieldCounts(),
    previews: emptyFieldCounts(),
    classifications: {
      scanned: 0,
      would_update: 0,
      skipped_already_set: 0,
      still_unmapped: 0,
    },
  };
  const categoryCache = new Map<
    string,
    { id: string; slug: string; name: string } | null
  >();

  const categoryRowFor = async (slug: string) => {
    if (!categoryCache.has(slug)) {
      categoryCache.set(slug, await input.store.findCategoryBySlug(slug));
    }
    return categoryCache.get(slug) ?? null;
  };

  for (const dealId of dealIds) {
    const deal = await input.store.getDealById(dealId);
    if (!deal) {
      continue;
    }
    result.scanned += 1;
    const preview = await input.store.getDealPreview(dealId);
    const classificationRows =
      await input.store.listClassificationsForCategoryBackfill(dealId);
    const orderedRows = [
      ...classificationRows.filter((row) => row.isPrimary),
      ...classificationRows.filter((row) => !row.isPrimary),
    ];
    const codes = orderedRows.map((row) => row.cpvCode);
    const mapped = categoryFromCpvs(codes);
    const mappedIndex = codes.findIndex(
      (code) => categoryFromCpv(code) !== null,
    );
    const primaryMapped = mappedIndex === 0;

    const dealPlan = planCategoryChange({
      current: deal.mainCategory,
      other: preview?.mainCategory ?? null,
      mapped,
      primaryMapped,
    });
    tallyField(result.deals, dealPlan);
    if (apply && dealPlan.next) {
      await input.store.updateDealMainCategory(dealId, dealPlan.next);
    }

    if (preview) {
      const previewPlan = planCategoryChange({
        current: preview.mainCategory,
        other: deal.mainCategory,
        mapped,
        primaryMapped,
      });
      tallyField(result.previews, previewPlan);
      if (apply && previewPlan.next) {
        await input.store.updateDealPreviewMainCategory(dealId, previewPlan.next);
      }
    }

    for (const row of orderedRows) {
      result.classifications.scanned += 1;
      if (row.categoryId) {
        result.classifications.skipped_already_set += 1;
        continue;
      }
      const category = categoryFromCpv(row.cpvCode);
      const categoryRow = category ? await categoryRowFor(category.slug) : null;
      if (!categoryRow) {
        result.classifications.still_unmapped += 1;
        continue;
      }
      result.classifications.would_update += 1;
      if (apply) {
        await input.store.updateClassificationCategoryId(row.id, categoryRow.id);
      }
    }
  }

  return result;
}
