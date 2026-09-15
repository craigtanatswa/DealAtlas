import type { PublicDealPreview } from "@/lib/search/dto";
import type { DealStatus } from "@/lib/search/filters";

export type LeakageRiskLevel = "LOW" | "REVIEW" | "HIGH";

export type PublicIndexKind = "deal-preview" | "search" | "internal";

export type PublicIndexReason =
  | "ok"
  | "unpublished"
  | "leak-risk"
  | "thin"
  | "duplicate"
  | "search-url"
  | "internal";

export type PreviewIndexSignals = {
  previewTitle: string;
  previewSummary: string;
  mainCategory: string | null;
  broadRegion: string | null;
  valueBand: string | null;
  deadlineBand: string | null;
  status: DealStatus;
};

export type PublicIndexDecision = {
  index: boolean;
  follow: boolean;
  reason: PublicIndexReason;
};

const GENERIC_TITLE = /^(opportunity|open opportunity|sanitised opportunity|deal preview)$/i;
const GENERIC_SUMMARY =
  /^(a sanitised summary\.?|sanitised preview\.?|opportunity summary\.?)$/i;
const VOID_STATUSES = new Set<DealStatus>(["CANCELLED", "WITHDRAWN"]);
const MIN_TITLE_LENGTH = 28;
const MIN_SUMMARY_LENGTH = 80;

export function isThinPreviewContent(signals: PreviewIndexSignals): boolean {
  const title = signals.previewTitle.trim();
  const summary = signals.previewSummary.trim();
  if (title.length < MIN_TITLE_LENGTH || GENERIC_TITLE.test(title)) {
    return true;
  }
  if (summary.length < MIN_SUMMARY_LENGTH || GENERIC_SUMMARY.test(summary)) {
    return true;
  }
  const uniqueSignals = [
    signals.mainCategory,
    signals.broadRegion,
    signals.valueBand,
    signals.deadlineBand,
  ].filter((value) => Boolean(value && value.trim())).length;
  return uniqueSignals < 2;
}

export function signalsFromPublicPreview(
  preview: PublicDealPreview,
): PreviewIndexSignals {
  return {
    previewTitle: preview.previewTitle,
    previewSummary: preview.previewSummary,
    mainCategory: preview.mainCategory,
    broadRegion: preview.broadRegion,
    valueBand: preview.valueBand,
    deadlineBand: preview.deadlineBand,
    status: preview.status,
  };
}

export function evaluatePublicIndexability(input: {
  kind: PublicIndexKind;
  published?: boolean;
  leakageRisk?: LeakageRiskLevel;
  preview?: PreviewIndexSignals | null;
  hasSearchFilters?: boolean;
  searchPage?: number;
}): PublicIndexDecision {
  if (input.kind === "internal") {
    return { index: false, follow: false, reason: "internal" };
  }

  if (input.kind === "search") {
    if (input.hasSearchFilters || (input.searchPage ?? 1) > 1) {
      return { index: false, follow: true, reason: "search-url" };
    }
    return { index: true, follow: true, reason: "ok" };
  }

  if (input.published === false || !input.preview) {
    return { index: false, follow: false, reason: "unpublished" };
  }
  if (input.leakageRisk && input.leakageRisk !== "LOW") {
    return { index: false, follow: false, reason: "leak-risk" };
  }
  if (VOID_STATUSES.has(input.preview.status)) {
    return { index: false, follow: true, reason: "duplicate" };
  }
  if (isThinPreviewContent(input.preview)) {
    return { index: false, follow: true, reason: "thin" };
  }
  return { index: true, follow: true, reason: "ok" };
}

export function isIndexablePublicPreview(preview: PublicDealPreview): boolean {
  return evaluatePublicIndexability({
    kind: "deal-preview",
    published: true,
    leakageRisk: "LOW",
    preview: signalsFromPublicPreview(preview),
  }).index;
}
