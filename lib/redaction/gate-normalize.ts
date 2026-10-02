/**
 * Normalisation helpers mirrored by the database publish gate (migration 0018).
 * Keep these byte-for-byte compatible with `private.leak_norm`, the
 * `leak_match_name` generated columns and pg_trgm `similarity()`.
 */

/** `private.leak_norm`: padded lowercase ASCII alphanumeric words. */
export function leakNorm(value: string | null | undefined): string {
  return ` ${(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

export function leakTokens(value: string | null | undefined): string[] {
  const trimmed = leakNorm(value).trim();
  return trimmed ? trimmed.split(" ") : [];
}

export function containsNorm(haystackNorm: string, needle: string | null | undefined): boolean {
  const norm = leakNorm(needle);
  return norm.trim().length > 0 && haystackNorm.includes(norm);
}

const LEGAL_SUFFIX_RE = /\b(ltd|limited|llp|plc|llc|inc|cic|co|the)\b/g;

/** `organizations.leak_match_name`: name without legal suffixes, null when < 5 chars. */
export function leakMatchName(name: string | null | undefined): string | null {
  const stripped = (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(LEGAL_SUFFIX_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length >= 5 ? ` ${stripped} ` : null;
}

function trigrams(value: string): Set<string> {
  const grams = new Set<string>();
  for (const word of value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const padded = `  ${word} `;
    for (let index = 0; index < padded.length - 2; index += 1) {
      grams.add(padded.slice(index, index + 3));
    }
  }
  return grams;
}

/** pg_trgm `similarity()`: shared trigrams over the union of both sets. */
export function pgTrgmSimilarity(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const gram of a) {
    if (b.has(gram)) {
      shared += 1;
    }
  }
  return shared / (a.size + b.size - shared);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) {
    return `${day}th`;
  }
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

const LONDON_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date (UTC midnight) of a source date/timestamp in Europe/London. */
export function londonCalendarDate(value: string): Date | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const instant = new Date(trimmed);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  return new Date(`${LONDON_DATE.format(instant)}T00:00:00Z`);
}

/**
 * Written forms of each source date +/- one day, matching the `to_char`
 * formats used by the database gate.
 */
export function sourceDateCandidates(values: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const value of values) {
    if (!value) {
      continue;
    }
    const base = londonCalendarDate(value);
    if (!base) {
      continue;
    }
    for (const offset of [-1, 0, 1]) {
      const date = new Date(base.getTime() + offset * 86_400_000);
      const y = date.getUTCFullYear();
      const m = date.getUTCMonth() + 1;
      const d = date.getUTCDate();
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      const month = MONTHS[m - 1];
      const mon = month.slice(0, 3);
      out.add(`${y}-${mm}-${dd}`);
      out.add(`${dd}/${mm}/${y}`);
      out.add(`${d}/${m}/${y}`);
      out.add(`${dd}/${mm}/${String(y).slice(-2)}`);
      out.add(`${d} ${month}`);
      out.add(`${ordinal(d)} ${month}`);
      out.add(`${d} ${mon}`);
      out.add(`${ordinal(d)} ${mon}`);
      out.add(`${month} ${d}`);
      out.add(`${month} ${ordinal(d)}`);
      out.add(`${mon} ${d}`);
    }
  }
  return [...out];
}

/** Outward code of a full UK postcode, uppercase, or null. */
export function postcodeOutward(value: string | null | undefined): string | null {
  const compact = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(compact)) {
    return null;
  }
  return compact.slice(0, -3);
}
