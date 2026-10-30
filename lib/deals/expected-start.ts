/**
 * Pipeline deals have no tender deadline. Where a deadline would show, they
 * show the expected contract start instead. Free channels get a coarse band
 * only (no month or day); paid channels get the exact date. Nothing here names
 * where a deal came from.
 */
export const PIPELINE_DEAL_TYPE = "PROCUREMENT_PIPELINE";
export const EXPECTED_START_LABEL = "Expected start";

export const EXPECTED_START_BANDS = [
  "date passed",
  "within 3 months",
  "in 3–6 months",
  "in 6–12 months",
  "in 12 months or more",
] as const;

export type ExpectedStartBand = (typeof EXPECTED_START_BANDS)[number];

const PHRASE = /^Expected start (date passed|within 3 months|in 3–6 months|in 6–12 months|in 12 months or more)$/;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True when the deal is a pipeline deal with no deadline to show. */
export function showsExpectedStart(input: {
  dealType?: string | null;
  submissionDeadline?: string | null;
}): boolean {
  return input.dealType === PIPELINE_DEAL_TYPE && !input.submissionDeadline;
}

/** Coarse band for free channels. Null when there is no usable start date. */
export function expectedStartBand(
  start: string | null | undefined,
  now: Date,
): ExpectedStartBand | null {
  const date = parseDate(start);
  if (!date) return null;
  const months =
    (date.getUTCFullYear() - now.getUTCFullYear()) * 12 +
    (date.getUTCMonth() - now.getUTCMonth()) +
    (date.getUTCDate() >= now.getUTCDate() ? 0 : -1);
  if (date.getTime() < now.getTime() - 86_400_000) return "date passed";
  if (months < 3) return "within 3 months";
  if (months < 6) return "in 3–6 months";
  if (months < 12) return "in 6–12 months";
  return "in 12 months or more";
}

export function expectedStartPhrase(band: ExpectedStartBand): string {
  return `${EXPECTED_START_LABEL} ${band}`;
}

/** Finds the expected-start phrase inside a preview keyDates string. */
export function expectedStartFromKeyDates(
  keyDates: string | null | undefined,
): string | null {
  if (!keyDates) return null;
  for (const part of keyDates.split(/\.\s+/)) {
    const text = part.replace(/\.$/, "").trim();
    if (PHRASE.test(text)) return text;
  }
  return null;
}

/** Exact date for paid channels, e.g. "1 March 2027". */
export function formatExpectedStart(start: string | null | undefined): string | null {
  const date = parseDate(start);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Paid alert/detail value: exact expected start for a pipeline deal with no deadline. */
export function paidExpectedStart(input: {
  dealType?: string | null;
  submissionDeadline?: string | null;
  contractStartDate?: string | null;
}): string | null {
  if (!showsExpectedStart(input)) return null;
  return formatExpectedStart(input.contractStartDate);
}
