import { toTimestamptz } from "@/ingestion/normalizers/text";

export function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function blank(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (!text || /^(n\/a|tbc|null|-)$/i.test(text)) {
    return null;
  }
  return text;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** ISO date, dd/mm/yyyy, or Mon-YY. Unparseable values stay null. */
export function parseUkDate(value: unknown): string | null {
  const text = blank(value);
  if (!text) {
    return null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const mon = /^([A-Za-z]{3})-(\d{2})$/.exec(text);
  if (mon) {
    const month = MONTHS[mon[1].toLowerCase()];
    if (!month) {
      return null;
    }
    const year = 2000 + Number(mon[2]);
    return `${year}-${String(month).padStart(2, "0")}-01`;
  }
  return null;
}

const LONDON_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function londonOffsetMinutes(date: Date): number {
  const parts = LONDON_TIME.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** End of the UK calendar day as a UTC ISO timestamp. */
export function toUkEndOfDayTimestamptz(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const noon = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(noon.getTime())) {
    return null;
  }
  const offsetMinutes = londonOffsetMinutes(noon);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(
    absolute % 60,
  ).padStart(2, "0")}`;
  return toTimestamptz(`${value}T23:59:59.999${offset}`);
}

export function isRmNumber(value: string): boolean {
  return /^RM\d+(?:\.\d+)?$/i.test(value.trim());
}

export function normaliseRm(value: string): string {
  return value.trim().toUpperCase();
}
