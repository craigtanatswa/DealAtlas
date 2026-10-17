import { isBelowNuts1Place } from "@/lib/preview/region";
import { leakTokens } from "@/lib/redaction/gate-normalize";

/**
 * Fail-closed risk detector for free-preview prose (scope, technical specs).
 * Runs on the raw source text BEFORE redaction. Any hit means the field is
 * dropped, never partially redacted. Mirrored in SQL by
 * private.preview_detail_text_risky (migration 0041).
 */

/** Uppercase tokens that are generic vocabulary, not names or acronyms of bodies. */
export const SAFE_UPPERCASE_TOKENS = new Set([
  "ISO", "IEC", "PAS", "GDPR", "UK", "IT", "ICT", "SME", "SMES", "VAT", "HR",
  "AI", "CCTV", "LED", "PPE", "BIM", "HVAC", "GBP", "EUR", "USD", "BS", "EN",
  "PC", "PCS", "TV", "CPD", "KPI", "KPIS", "SLA", "SLAS", "API", "APIS", "PDF",
]);

export const PORTAL_TERMS = [
  "esourcing", "in-tend", "proactis", "bluelight", "jaggaer", "atamis",
  "delta esourcing", "contracts finder", "find a tender", "sell2wales",
  "public contracts scotland", "publiccontractsscotland", "etendersni", "bravo",
  "mytenders", "due north", "procontract", "tenders electronic daily", "ted",
  "supply2gov", "achilles", "constructionline", "eu-supply",
];

export const FRAMEWORK_TERMS = [
  "crown commercial service", "ccs", "ypo", "espo", "nepo", "nhs supply chain",
  "g-cloud", "gcloud", "digital outcomes", "technology products and services",
  "network services", "pagabo", "fusion21", "lhc", "scape", "procure22",
  "procure 22", "nhs sbs", "shared business services", "pretium", "lot 1",
];

const PATTERNS: Array<[string, RegExp]> = [
  ["email", /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ["url", /https?:\/\/|\bwww\./i],
  ["domain", /\b[a-z0-9-]+\.(?:co\.uk|org\.uk|gov\.uk|nhs\.uk|ac\.uk|com|org|net|uk|io|eu)\b/i],
  ["ocds", /\bocds-/i],
  ["tender_id", /\btender_[a-z0-9]+/i],
  ["fts_id", /\b\d{6}-\d{4}\b/],
  ["uuid", /\b[0-9a-f]{8}-[0-9a-f]{4}-/i],
  ["ref", /\bref(?:erence)?\s*(?:no\.?|number)?\s*[:#]/i],
  ["rm_code", /\brm\s?\d{3,4}\b/i],
  ["day_count", /\b(?:closes?|closing|due|questions?\s+close)\s+in\s+\d+\s+days?\b/i],
  ["phone", /(?:\+?\d[\d ().-]{5,}\d)|\bext(?:ension)?\.?\s*\d+/i],
  ["postcode", /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i],
  ["long_code", /\b(?=[a-z_]*\d)(?=\d*[a-z_])[a-z0-9_]{4,}(?:[/-][a-z0-9_]+)+\b/i],
];

function containsTerm(lower: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(lower);
}

export function freeTextRisk(text: string | null | undefined): string | null {
  if (!text) {
    return null;
  }
  for (const [code, pattern] of PATTERNS) {
    if (pattern.test(text)) {
      return code;
    }
  }
  for (const match of text.matchAll(/\b[A-Z][A-Z0-9&]{1,}\b/g)) {
    if (!SAFE_UPPERCASE_TOKENS.has(match[0])) {
      return "uppercase_token";
    }
  }
  const lower = text.toLowerCase();
  for (const term of PORTAL_TERMS) {
    if (containsTerm(lower, term)) return "portal";
  }
  for (const term of FRAMEWORK_TERMS) {
    if (containsTerm(lower, term)) return "framework_name";
  }
  if (leakTokens(text).some((word) => isBelowNuts1Place(word))) {
    return "place";
  }
  return null;
}

export function isFreeTextRisky(text: string | null | undefined): boolean {
  return freeTextRisk(text) !== null;
}
