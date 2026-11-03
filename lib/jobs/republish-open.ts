import { contextFromPersisted } from "@/ingestion/intelligence/types";
import { generatePreviewDraftWithGateRetry, persistIntelligenceAndPreview } from "@/ingestion/preview/publish";
import { leakScanInputFromContext } from "@/ingestion/preview/generate";
import type { DataSourceRecord, DealPreviewRecord, DealRecord, IngestionStore } from "@/ingestion/store/types";
import { UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY } from "@/ingestion/sources/uk-infrastructure-pipeline/constants";
import { FILTER_TAXONOMY_NAMES } from "@/lib/categories/filter-map";
import { isTemplatePreviewSlug } from "@/lib/deals/public-slug";
import {
  deadlineMayPublish,
  sourceMayPublish,
  stageMayPublish,
} from "@/lib/deals/publish-gate";
import { deadlineTbcLabel } from "@/lib/preview/dates";
import {
  sanitisePreviewText,
  type SanitisedPreviewText,
} from "@/lib/redaction/sanitize";
import {
  scanPreviewLeaks,
  type LeakFinding,
  type LeakageRisk,
} from "@/lib/redaction/scan";

export const REPUBLISH_BUCKETS = [
  "admin_unpublished",
  "leak_HIGH",
  "leak_REVIEW",
  "no_deadline",
  "no_category",
  "other",
] as const;

export type RepublishBucket = (typeof REPUBLISH_BUCKETS)[number];

export const REPUBLISH_APPLY_ENV = "DEALATLAS_REPUBLISH_APPLY";
export const REPUBLISH_ALLOW_REMOTE_ENV = "DEALATLAS_REPUBLISH_ALLOW_REMOTE";
export const REPUBLISH_REMOTE_HOST_ENV = "DEALATLAS_REPUBLISH_REMOTE_HOST";
export const REPUBLISH_CONFIRM_ENV = "DEALATLAS_REPUBLISH_CONFIRM";
export const REPUBLISH_CONFIRM_VALUE = "PUBLISH";
export const REPUBLISH_WORKFLOW_NAME = "Republish open deals";
export const REPUBLISH_WORKFLOW_FILE = "republish-open-deals.yml";

export const REASON_ADMIN_HELD =
  "admin_unpublished, needs explicit --include-admin";
export const REASON_ALREADY_PUBLISHED = "already_published";
export const REASON_NO_SOURCE_CONTEXT = "no_source_context";
export const REASON_SOURCE = "source_not_publishable";
export const REASON_STATUS = "status_not_publishable";
export const REASON_DEADLINE = "deadline_not_publishable";
export const REASON_PUBLISH_BLOCKED = "publish_blocked";

export const FALLBACK_CATEGORY =
  FILTER_TAXONOMY_NAMES[FILTER_TAXONOMY_NAMES.length - 1] ?? "Other";

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
  "host.docker.internal",
]);

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

function republishProductionApproval(env: Record<string, string | undefined>): boolean {
  const workflow = env.GITHUB_WORKFLOW?.trim();
  const workflowNames = new Set([
    REPUBLISH_WORKFLOW_NAME,
    REPUBLISH_WORKFLOW_FILE,
    "republish-open-deals",
    `.github/workflows/${REPUBLISH_WORKFLOW_FILE}`,
  ]);
  return (
    env.GITHUB_ACTIONS?.trim().toLowerCase() === "true" &&
    Boolean(workflow && workflowNames.has(workflow)) &&
    env[REPUBLISH_CONFIRM_ENV]?.trim() === REPUBLISH_CONFIRM_VALUE
  );
}

/**
 * Explicit apply needs both the CLI flag and an environment confirmation. It
 * follows the same target rules as the preview regeneration and database test
 * guards: production is refused unless this exact GitHub workflow has been
 * dispatched with the PUBLISH confirmation. Remote non-production targets
 * still need a named opt-in.
 */
export function republishApplyBlockReason(
  env: Record<string, string | undefined>,
  apply = true,
): string | null {
  if (!apply) {
    return null;
  }
  if (env[REPUBLISH_APPLY_ENV]?.trim() !== "1") {
    return `refusing to apply without ${REPUBLISH_APPLY_ENV}=1`;
  }

  const productionApproved = republishProductionApproval(env);
  const productionEnvironment = env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
  if (productionEnvironment && !productionApproved) {
    return "refusing to apply republish-open-deals in a production environment";
  }

  const targets = [env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_URL, env.DATABASE_URL].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  const prodHost = safeHost(env.DEALATLAS_PROD_SUPABASE_URL);
  const prodRef = env.DEALATLAS_PROD_SUPABASE_PROJECT_REF?.trim().toLowerCase() ?? "";

  for (const target of targets) {
    const host = safeHost(target);
    if (!host) {
      return "refusing to apply republish-open-deals because the database target is not a URL";
    }
    const isProductionTarget =
      productionEnvironment ||
      Boolean((prodHost && host === prodHost) || (prodRef && host.split(".").includes(prodRef)));
    if (isProductionTarget) {
      if (productionApproved) {
        continue;
      }
      return `refusing to apply republish-open-deals against the production project ${host}`;
    }
    if (LOCAL_HOSTS.has(host)) {
      continue;
    }
    if (env[REPUBLISH_ALLOW_REMOTE_ENV]?.trim() !== "1") {
      return `refusing to apply republish-open-deals against non-local database ${host}`;
    }
    if (env[REPUBLISH_REMOTE_HOST_ENV]?.trim().toLowerCase() !== host) {
      return `${REPUBLISH_REMOTE_HOST_ENV} must equal ${host} to allow this remote target`;
    }
    if (!prodHost && !prodRef) {
      return "set DEALATLAS_PROD_SUPABASE_URL or DEALATLAS_PROD_SUPABASE_PROJECT_REF so remote targets can be checked against production";
    }
  }
  return null;
}

export type RepublishBucketSummary = {
  candidates: number;
  would_publish: number;
  still_held: Record<string, number>;
};

export type RepublishCounts = {
  would_publish: number;
  admin_held_included: number;
  leak_held_cleaned_passing: number;
  still_held: Record<string, number>;
};

export type RepublishDealAction =
  | "publish"
  | "regenerate_publish"
  | "sanitize_publish"
  | "hold";

export type RepublishDealOutcome = {
  dealId: string;
  bucket: RepublishBucket;
  action: RepublishDealAction;
  reason: string | null;
  leakageRisk: LeakageRisk | null;
  deadlineLabel: string | null;
  category: string | null;
};

export type RepublishOpenResult = {
  mode: "dry-run" | "apply";
  includeAdmin: boolean;
  counts: RepublishCounts;
  buckets: Record<RepublishBucket, RepublishBucketSummary>;
  deals: RepublishDealOutcome[];
};

export type RepublishOpenOptions = {
  store: IngestionStore;
  apply?: boolean;
  includeAdmin?: boolean;
  now?: Date;
  env?: Record<string, string | undefined>;
  limit?: number;
  /** When set, only inspect these deals instead of the default database query. */
  dealIds?: string[];
};

function emptyBuckets(): Record<RepublishBucket, RepublishBucketSummary> {
  return Object.fromEntries(
    REPUBLISH_BUCKETS.map((bucket) => [
      bucket,
      { candidates: 0, would_publish: 0, still_held: {} },
    ]),
  ) as Record<RepublishBucket, RepublishBucketSummary>;
}

function categoryFor(deal: DealRecord, preview: DealPreviewRecord): string | null {
  const dealCategory = deal.mainCategory?.trim();
  if (dealCategory) {
    return dealCategory;
  }
  const previewCategory = preview.mainCategory?.trim();
  return previewCategory || null;
}

function fallbackCategoryFor(
  deal: DealRecord,
  preview: DealPreviewRecord,
): string {
  return categoryFor(deal, preview) ?? FALLBACK_CATEGORY;
}

export function republishBucketFor(
  deal: DealRecord,
  preview: DealPreviewRecord,
): RepublishBucket {
  if (preview.unpublishedByAdmin) {
    return "admin_unpublished";
  }
  if (preview.leakageRisk === "HIGH") {
    return "leak_HIGH";
  }
  if (preview.leakageRisk === "REVIEW") {
    return "leak_REVIEW";
  }
  if (!deal.submissionDeadline) {
    return "no_deadline";
  }
  if (!preview.mainCategory?.trim()) {
    return "no_category";
  }
  return "other";
}

/**
 * Mirrors the first-publication predicate in publish_eligible_previews. ACTIVE
 * is treated like OPEN here because the explicit job scope includes it.
 */
export function republishEligibilityReason(input: {
  deal: DealRecord;
  source: DataSourceRecord;
  now: Date;
}): string | null {
  const { deal, source, now } = input;
  if (!sourceMayPublish({ enabled: source.enabled, reuseStatus: source.reuseStatus })) {
    return REASON_SOURCE;
  }
  const status = deal.status === "ACTIVE" ? "OPEN" : deal.status;
  const stage = deal.status === "ACTIVE" ? "LIVE" : deal.stage;
  if (!stageMayPublish(status, stage)) {
    return REASON_STATUS;
  }
  const deadline = deal.submissionDeadline ? new Date(deal.submissionDeadline) : null;
  if (deadline && Number.isNaN(deadline.getTime())) {
    return REASON_DEADLINE;
  }
  if (!deadlineMayPublish(status, deadline, now)) {
    return REASON_DEADLINE;
  }
  return null;
}

function scanExistingPreview(context: Parameters<typeof leakScanInputFromContext>[0], preview: DealPreviewRecord) {
  return scanPreviewLeaks(
    leakScanInputFromContext(
      context,
      {
        previewTitle: preview.previewTitle,
        previewSummary: preview.previewSummary,
        requirementsPreview: preview.requirementsPreview,
        relevanceTags: preview.relevanceTags,
      },
      { slug: preview.slug, broadRegion: preview.broadRegion },
    ),
  );
}

type RepublishContext = Parameters<typeof scanExistingPreview>[0];
type SanitiseDraft = Pick<
  DealPreviewRecord,
  "previewTitle" | "previewSummary" | "requirementsPreview" | "relevanceTags"
>;

function sanitisationSourceParts(context: RepublishContext): string[] {
  return [
    context.deal.sourceTitle,
    context.deal.sourceDescription,
    context.source.name,
    context.source.sourceKey,
    ...context.lots.flatMap((lot) => [lot.sourceTitle, lot.sourceDescription]),
    ...context.requirements.flatMap((item) => [item.name, item.description]),
  ].filter((item): item is string => Boolean(item?.trim()));
}

function sanitisationProtectedTerms(context: RepublishContext): string[] {
  const { deal, buyer } = context;
  return [
    buyer?.canonicalName,
    buyer?.city,
    buyer?.region,
    buyer?.addressLine1,
    buyer?.postcode,
    buyer?.domain,
    buyer?.website,
    buyer?.email,
    buyer?.phone,
    deal.exactLocationText,
    deal.reference,
    deal.ocid,
    deal.externalPrimaryId,
    deal.sourceUrl,
    deal.applicationUrl,
    context.source.name,
    context.source.sourceKey,
    context.privateSourceUrl,
    ...context.buyerAliases,
    ...(context.privateBuyerNames ?? []),
    ...(context.privateBuyerDomains ?? []),
    ...context.noticeIdentifiers,
    ...context.lots.map((lot) => lot.exactLocationText),
  ].filter((item): item is string => Boolean(item?.trim()));
}

function scanDraftPreview(
  context: RepublishContext,
  draft: SanitiseDraft,
  slug: string | null,
  broadRegion: string | null,
) {
  return scanPreviewLeaks(
    leakScanInputFromContext(context, draft, { slug, broadRegion }),
  );
}

/**
 * Removes flagged literal identifiers and reverse-searchable prose from the
 * preview-owned fields, then re-runs the unchanged leak scanner. Returns null
 * unless the sanitised text reaches LOW risk.
 */
function trySanitisePreview(input: {
  context: RepublishContext;
  draft: SanitiseDraft;
  slug: string | null;
  broadRegion: string | null;
  findings: LeakFinding[];
}): (SanitisedPreviewText & { findings: LeakFinding[] }) | null {
  const sourceParts = sanitisationSourceParts(input.context);
  const protectedTerms = sanitisationProtectedTerms(input.context);
  const tokens = new Set(
    input.findings
      .map((finding) => finding.token?.trim())
      .filter((token): token is string => Boolean(token)),
  );
  let draft: SanitiseDraft = input.draft;
  let findings = input.findings;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sanitised = sanitisePreviewText({
      previewTitle: draft.previewTitle,
      previewSummary: draft.previewSummary,
      requirementsPreview: draft.requirementsPreview,
      sourceParts,
      protectedTerms,
      findingTokens: [...tokens],
    });
    if (!sanitised) {
      return null;
    }
    draft = { ...draft, ...sanitised };
    const scan = scanDraftPreview(
      input.context,
      draft,
      input.slug,
      input.broadRegion,
    );
    if (scan.risk === "LOW") {
      return { ...sanitised, findings: scan.findings };
    }
    findings = scan.findings;
    let added = false;
    for (const token of findings) {
      const value = token.token?.trim();
      if (value && !tokens.has(value)) {
        tokens.add(value);
        added = true;
      }
    }
    if (!added) {
      return null;
    }
  }
  return null;
}

function needsRegeneration(input: {
  bucket: RepublishBucket;
  deal: DealRecord;
  preview: DealPreviewRecord;
  risk: LeakageRisk;
}): boolean {
  if (input.bucket === "leak_HIGH" || input.bucket === "leak_REVIEW") {
    return true;
  }
  if (input.preview.leakageRisk !== "LOW" || input.risk !== "LOW") {
    return true;
  }
  if (input.preview.status !== input.deal.status || input.preview.stage !== input.deal.stage) {
    return true;
  }
  return !isTemplatePreviewSlug(
    input.preview.slug,
    input.preview.previewTitle,
    input.deal.id,
  );
}

export async function runRepublishOpenDeals(
  input: RepublishOpenOptions,
): Promise<RepublishOpenResult> {
  const apply = input.apply === true;
  const includeAdmin = input.includeAdmin === true;
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  const blocked = republishApplyBlockReason(env, apply);
  if (blocked) {
    throw new Error(blocked);
  }

  const dealIds =
    input.dealIds ??
    (await input.store.listRepublishOpenDealIds(now.toISOString(), input.limit));
  const buckets = emptyBuckets();
  const deals: RepublishDealOutcome[] = [];
  let adminHeldIncluded = 0;
  let leakHeldCleanedPassing = 0;

  for (const dealId of dealIds) {
    let bucket: RepublishBucket = "other";
    try {
      const deal = await input.store.getDealById(dealId);
      const preview = await input.store.getDealPreview(dealId);
      if (!deal || !preview) {
        continue;
      }
      bucket = republishBucketFor(deal, preview);
      const summary = buckets[bucket];
      summary.candidates += 1;
      if (bucket === "admin_unpublished" && includeAdmin) {
        adminHeldIncluded += 1;
      }

      const hold = (reason: string, leakageRisk: LeakageRisk | null = null) => {
        summary.still_held[reason] = (summary.still_held[reason] ?? 0) + 1;
        deals.push({
          dealId,
          bucket,
          action: "hold",
          reason,
          leakageRisk,
          deadlineLabel: null,
          category: categoryFor(deal, preview),
        });
      };

      if (preview.isPublished) {
        hold(REASON_ALREADY_PUBLISHED);
        continue;
      }
      if (bucket === "admin_unpublished" && !includeAdmin) {
        hold(REASON_ADMIN_HELD);
        continue;
      }

      const source = deal.primarySourceId
        ? await input.store.getSourceById(deal.primarySourceId)
        : null;
      if (!source) {
        hold(REASON_NO_SOURCE_CONTEXT);
        continue;
      }

      const ineligible = republishEligibilityReason({ deal, source, now });
      if (ineligible) {
        hold(ineligible);
        continue;
      }

      const context = await contextFromPersisted({
        store: input.store,
        deal,
        now,
      });
      if (!context) {
        hold(REASON_NO_SOURCE_CONTEXT);
        continue;
      }

      const currentScan = scanExistingPreview(context, preview);
      const leakHeld = bucket === "leak_HIGH" || bucket === "leak_REVIEW";
      let risk: LeakageRisk = currentScan.risk;
      let regenerated = false;
      let sanitisedText: SanitisedPreviewText | null = null;

      // A held preview can sometimes be salvaged directly. Only remove text
      // from preview-owned fields, then let the unchanged scanner decide.
      if (leakHeld && currentScan.risk !== "LOW") {
        const salvaged = trySanitisePreview({
          context,
          draft: preview,
          slug: preview.slug,
          broadRegion: preview.broadRegion,
          findings: currentScan.findings,
        });
        if (salvaged) {
          risk = "LOW";
          sanitisedText = salvaged;
        }
      }

      const regenerate =
        sanitisedText === null &&
        needsRegeneration({
          bucket,
          deal,
          preview,
          risk,
        });

      if (regenerate) {
        regenerated = true;
        if (apply) {
          const outcome = await persistIntelligenceAndPreview({
            store: input.store,
            context,
            publication: "preserve",
          });
          risk = outcome.leakageRisk;
          if (risk !== "LOW") {
            const fresh = (await input.store.getDealPreview(dealId)) ?? preview;
            const salvaged = trySanitisePreview({
              context,
              draft: fresh,
              slug: fresh.slug,
              broadRegion: fresh.broadRegion,
              findings: outcome.findings,
            });
            if (salvaged) {
              risk = "LOW";
              sanitisedText = salvaged;
            }
          }
        } else {
          const gated = await generatePreviewDraftWithGateRetry(context);
          risk = gated.draft.leakageRisk;
          if (risk !== "LOW") {
            const salvaged = trySanitisePreview({
              context,
              draft: gated.draft,
              slug: preview.slug,
              broadRegion: gated.draft.broadRegion,
              findings: gated.draft.findings,
            });
            if (salvaged) {
              risk = "LOW";
              sanitisedText = salvaged;
            }
          }
        }
      }

      if (risk !== "LOW") {
        hold(`leak_${risk}`, risk);
        continue;
      }

      const category = fallbackCategoryFor(deal, preview);
      const deadlineLabel = deal.submissionDeadline
        ? null
        : deadlineTbcLabel(source.sourceKey);
      const deadlineBand =
        !deal.submissionDeadline &&
        source.sourceKey === UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY
          ? deadlineLabel
          : undefined;

      if (apply) {
        const saved = await input.store.publishDealPreview({
          dealId,
          mainCategory: category,
          deadlineBand,
          clearAdminHold: bucket === "admin_unpublished" && includeAdmin,
          ...(sanitisedText
            ? {
                previewTitle: sanitisedText.previewTitle,
                previewSummary: sanitisedText.previewSummary,
                requirementsPreview: sanitisedText.requirementsPreview,
                leakageRisk: "LOW" as const,
              }
            : {}),
        });
        if (!saved?.isPublished) {
          hold(REASON_PUBLISH_BLOCKED, risk);
          continue;
        }
      }

      summary.would_publish += 1;
      if (sanitisedText && leakHeld) {
        leakHeldCleanedPassing += 1;
      }
      deals.push({
        dealId,
        bucket,
        action: sanitisedText
          ? "sanitize_publish"
          : regenerated
            ? "regenerate_publish"
            : "publish",
        reason: null,
        leakageRisk: risk,
        deadlineLabel,
        category,
      });
    } catch (error) {
      const reason = `error: ${error instanceof Error ? error.message : "unknown"}`;
      const summary = buckets[bucket];
      summary.still_held[reason] = (summary.still_held[reason] ?? 0) + 1;
      deals.push({
        dealId,
        bucket,
        action: "hold",
        reason,
        leakageRisk: null,
        deadlineLabel: null,
        category: null,
      });
    }
  }

  const stillHeld: Record<string, number> = {};
  for (const bucket of REPUBLISH_BUCKETS) {
    for (const [reason, count] of Object.entries(buckets[bucket].still_held)) {
      stillHeld[reason] = (stillHeld[reason] ?? 0) + count;
    }
  }

  return {
    mode: apply ? "apply" : "dry-run",
    includeAdmin,
    counts: {
      would_publish: REPUBLISH_BUCKETS.reduce(
        (total, bucket) => total + buckets[bucket].would_publish,
        0,
      ),
      admin_held_included: adminHeldIncluded,
      leak_held_cleaned_passing: leakHeldCleanedPassing,
      still_held: stillHeld,
    },
    buckets,
    deals,
  };
}
