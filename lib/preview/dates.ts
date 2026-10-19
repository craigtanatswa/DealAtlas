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
