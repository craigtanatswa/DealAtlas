export const VALUE_BANDS = [
  "Under £25k",
  "£25k–£50k",
  "£50k–£100k",
  "£100k–£250k",
  "£250k–£500k",
  "£500k–£1m",
  "£1m–£5m",
  "£5m–£10m",
  "£10m+",
  "Undisclosed",
] as const;

export type ValueBand = (typeof VALUE_BANDS)[number];

export const DEADLINE_BANDS = [
  "Closing today",
  "Within 3 days",
  "Within 7 days",
  "Within 14 days",
  "Within 30 days",
  "More than 30 days",
  "Upcoming / date not yet fixed",
  "Closed",
] as const;

export type DeadlineBand = (typeof DEADLINE_BANDS)[number];

export const DURATION_BANDS = [
  "Under 3 months",
  "3–6 months",
  "6–12 months",
  "1–2 years",
  "2–3 years",
  "3–5 years",
  "5+ years",
  "Not disclosed",
] as const;

export type DurationBand = (typeof DURATION_BANDS)[number];

const CLOSED_STATUSES = new Set([
  "CLOSED",
  "AWARDED",
  "CANCELLED",
  "EXPIRED",
  "WITHDRAWN",
]);

export function valueBandFromAmounts(
  min: number | null | undefined,
  max: number | null | undefined,
): ValueBand {
  const amount = max ?? min ?? null;
  if (amount == null || !Number.isFinite(amount) || amount < 0) {
    return "Undisclosed";
  }
  if (amount < 25_000) return "Under £25k";
  if (amount < 50_000) return "£25k–£50k";
  if (amount < 100_000) return "£50k–£100k";
  if (amount < 250_000) return "£100k–£250k";
  if (amount < 500_000) return "£250k–£500k";
  if (amount < 1_000_000) return "£500k–£1m";
  if (amount < 5_000_000) return "£1m–£5m";
  if (amount < 10_000_000) return "£5m–£10m";
  return "£10m+";
}

export function deadlineBandFromDeadline(
  deadline: string | null | undefined,
  now: Date,
  status?: string | null,
): DeadlineBand {
  if (status && CLOSED_STATUSES.has(status)) {
    return "Closed";
  }
  if (!deadline) {
    return "Upcoming / date not yet fixed";
  }
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) {
    return "Upcoming / date not yet fixed";
  }
  if (due.getTime() < now.getTime()) {
    return "Closed";
  }

  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startOfDue = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const days = Math.round((startOfDue - startOfToday) / 86_400_000);

  if (days <= 0) return "Closing today";
  if (days <= 3) return "Within 3 days";
  if (days <= 7) return "Within 7 days";
  if (days <= 14) return "Within 14 days";
  if (days <= 30) return "Within 30 days";
  return "More than 30 days";
}

export function durationBandFromDates(
  start: string | null | undefined,
  end: string | null | undefined,
  extensionEnd?: string | null,
): DurationBand {
  if (!start || !(end || extensionEnd)) {
    return "Not disclosed";
  }
  const from = new Date(start);
  const to = new Date(extensionEnd || end || "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return "Not disclosed";
  }
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth()) +
    (to.getUTCDate() >= from.getUTCDate() ? 0 : -1);

  if (months < 3) return "Under 3 months";
  if (months < 6) return "3–6 months";
  if (months < 12) return "6–12 months";
  if (months < 24) return "1–2 years";
  if (months < 36) return "2–3 years";
  if (months < 60) return "3–5 years";
  return "5+ years";
}
