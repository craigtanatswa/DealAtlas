import { UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY } from "@/ingestion/sources/uk-infrastructure-pipeline/constants";
import { londonCalendarDate } from "@/lib/redaction/gate-normalize";

export const DEADLINE_TBC_LABEL = "Deadline TBC";
export const START_DATE_TBC_LABEL = "Start date TBC";

/**
 * Copy for a preview with no submission deadline. The UK Infrastructure
 * Pipeline publishes project starts rather than tender deadlines.
 */
export function deadlineTbcLabel(sourceKey: string | null | undefined): string {
  return sourceKey === UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY
    ? START_DATE_TBC_LABEL
    : DEADLINE_TBC_LABEL;
}

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
