import { FEATURE_LIMITS, UNLIMITED, type FeatureLimits, type Plan } from "@/lib/constants";

export { UNLIMITED };

export type QuotaFeature = keyof FeatureLimits;

export function featureLimit(plan: Plan, feature: QuotaFeature): number | null {
  return FEATURE_LIMITS[plan][feature];
}

export function isAtFeatureLimit(used: number, limit: number | null): boolean {
  return limit !== UNLIMITED && used >= limit;
}

export function remainingQuota(used: number, limit: number | null): number | null {
  if (limit === UNLIMITED) {
    return null;
  }
  return Math.max(0, limit - used);
}

export function quotaLabel(used: number, limit: number | null): string {
  if (limit === UNLIMITED) {
    return `${used} saved`;
  }
  return `${used} of ${limit} saved`;
}

export function mapQuotaError(
  message: string | undefined,
): "savedDeals" | "savedSearches" | "exportRows" | null {
  const normalised = (message ?? "").toLowerCase();
  if (normalised.includes("saved deal limit reached")) {
    return "savedDeals";
  }
  if (normalised.includes("saved search limit reached")) {
    return "savedSearches";
  }
  if (normalised.includes("export row limit reached")) {
    return "exportRows";
  }
  return null;
}

export const QUOTA_ERROR_COPY = {
  savedDeals:
    "Free accounts can save 5 opportunities. Upgrade to Pro for additional saved deals.",
  savedSearches:
    "Free accounts can save one search. Upgrade to Pro for up to 50 saved searches.",
  exportRows:
    "This workspace has used its export allowance for the current period.",
} as const;

export function exportQuotaLabel(used: number, limit: number | null): string {
  if (limit === UNLIMITED) {
    return `${used} exported this month`;
  }
  return `${used} of ${limit} exported this month`;
}
