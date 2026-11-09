/**
 * Placeholder buyer names: values a source puts in the buyer field when it
 * does not name the buyer. They identify nobody, so they are not leak tokens
 * and are not stored as buyer organisations.
 *
 * This list is hard-coded and frozen on purpose. Never load or extend it from
 * the database or from source data. Matching is on the WHOLE normalised name
 * only, so "Public Sector Pension Board" is a real name, not a placeholder.
 */
export const PLACEHOLDER_BUYER_NAMES: readonly string[] = Object.freeze([
  "buyer",
  "client",
  "confidential",
  "contracting authority",
  "contracting body",
  "contracting entity",
  "n a",
  "na",
  "none",
  "not applicable",
  "not known",
  "not specified",
  "public authority",
  "public body",
  "public sector",
  "tbc",
  "to be confirmed",
  "unknown",
  "various",
  "withheld",
]);

const PLACEHOLDER_SET: ReadonlySet<string> = new Set(PLACEHOLDER_BUYER_NAMES);

/** Lowercase, punctuation to spaces, collapsed whitespace. "N/A" -> "n a", " Public  Sector. " -> "public sector". */
export function normalizeBuyerNameForPlaceholder(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function isPlaceholderBuyerName(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalized = normalizeBuyerNameForPlaceholder(value);
  return normalized.length > 0 && PLACEHOLDER_SET.has(normalized);
}
