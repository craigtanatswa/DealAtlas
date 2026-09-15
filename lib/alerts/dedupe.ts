import type { AlertCadence } from "@/lib/saves/filters";
import type { AlertType, DigestCadence } from "@/lib/alerts/types";

export const NEW_MATCH_MIN_SCORE = 50;
export const DEADLINE_WINDOWS_DAYS = [1, 3, 7] as const;
export const RENEWAL_WINDOWS_DAYS = [30, 60, 90] as const;
export const DAILY_DIGEST_AFTER_MS = 20 * 60 * 60 * 1000;
export const WEEKLY_DIGEST_AFTER_MS = 6 * 24 * 60 * 60 * 1000;
export const DAILY_SEARCH_AFTER_MS = DAILY_DIGEST_AFTER_MS;
export const WEEKLY_SEARCH_AFTER_MS = WEEKLY_DIGEST_AFTER_MS;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function alertDedupeKey(
  type: AlertType,
  dealId: string,
  extra?: string | number | null,
): string {
  const suffix = extra == null || extra === "" ? "" : `:${extra}`;
  return `${type}:${dealId}${suffix}`;
}

export function utcDayStart(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function daysUntil(iso: string, now: Date): number | null {
  const target = Date.parse(iso);
  if (Number.isNaN(target)) {
    return null;
  }
  return Math.round((utcDayStart(target) - utcDayStart(now.getTime())) / MS_PER_DAY);
}

export function matchingWindow(
  remainingDays: number | null,
  windows: readonly number[],
): number | null {
  if (remainingDays == null || remainingDays < 0) {
    return null;
  }
  const sorted = [...windows].sort((left, right) => left - right);
  for (const window of sorted) {
    if (remainingDays <= window) {
      return window;
    }
  }
  return null;
}

export function shouldEvaluateSavedSearch(
  search: {
    enabled: boolean;
    alertCadence: AlertCadence;
    lastEvaluatedAt: string | null;
  },
  now: Date,
): boolean {
  if (!search.enabled || search.alertCadence === "NONE") {
    return false;
  }
  if (search.alertCadence === "IMMEDIATE") {
    return true;
  }
  const last = search.lastEvaluatedAt ? Date.parse(search.lastEvaluatedAt) : Number.NaN;
  if (!Number.isFinite(last)) {
    return true;
  }
  const elapsed = now.getTime() - last;
  if (search.alertCadence === "DAILY") {
    return elapsed >= DAILY_SEARCH_AFTER_MS;
  }
  if (search.alertCadence === "WEEKLY") {
    return elapsed >= WEEKLY_SEARCH_AFTER_MS;
  }
  return false;
}

export function isDigestDue(
  cadence: DigestCadence,
  lastDigestSentAt: string | null,
  now: Date,
  unsentCount: number,
): boolean {
  if (unsentCount <= 0) {
    return false;
  }
  if (cadence === "IMMEDIATE") {
    return true;
  }
  const last = lastDigestSentAt ? Date.parse(lastDigestSentAt) : Number.NaN;
  if (!Number.isFinite(last)) {
    return true;
  }
  const elapsed = now.getTime() - last;
  if (cadence === "DAILY") {
    return elapsed >= DAILY_DIGEST_AFTER_MS;
  }
  return elapsed >= WEEKLY_DIGEST_AFTER_MS;
}
