import { londonCalendarDate } from "@/lib/redaction/gate-normalize";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const CLOSED = new Set(["CLOSED", "AWARDED", "CANCELLED", "EXPIRED", "WITHDRAWN"]);

/**
 * Day granularity without a calendar date. The publish gate treats a copied
 * source day ("14 March") as a fingerprint, so the free preview says how many
 * days remain instead of repeating that day.
 */
export function deadlineDayLabel(
  deadline: string | null | undefined,
  now: Date,
  status?: string | null,
): string | null {
  if (status && CLOSED.has(status)) {
    return "Closed";
  }
  if (!deadline) {
    return null;
  }
  const due = londonCalendarDate(deadline);
  const today = londonCalendarDate(now.toISOString());
  if (!due || !today) {
    return null;
  }
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) {
    return "Closed";
  }
  if (days === 0) {
    return "Closes today";
  }
  if (days === 1) {
    return "Closes in 1 day";
  }
  return `Closes in ${days} days`;
}

/** Publication and award dates are month precision only. */
export function monthPrecisionLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = londonCalendarDate(value);
  if (!date) {
    return null;
  }
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
