import {
  BROAD_LOCATION_TERMS,
  GENERIC_ORG_TOKENS,
  GENERIC_PROPER_WORDS,
  PHRASE_STOPWORDS,
} from "@/lib/redaction/gate-vocabulary";
import { leakNorm, leakTokens } from "@/lib/redaction/gate-normalize";
import { isBelowNuts1Place } from "@/lib/preview/region";

const GENERIC = new Set<string>([
  ...GENERIC_ORG_TOKENS,
  ...GENERIC_PROPER_WORDS,
  ...BROAD_LOCATION_TERMS,
  ...PHRASE_STOPWORDS,
]);

/** Existing gate flags a 6-word source phrase. Stay inside that cap. */
const MAX_SOURCE_RUN = 5;

export function sourceCorpus(parts: Array<string | null | undefined>): string {
  return leakNorm(parts.filter((item): item is string => Boolean(item)).join(" "));
}

export function breakSourceRuns(text: string, corpus: string, maxRun = MAX_SOURCE_RUN): string {
  const words = text.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  const norms: string[] = [];
  for (const word of words) {
    const norm = leakTokens(word)[0];
    if (!norm) {
      kept.push(word);
      continue;
    }
    kept.push(word);
    norms.push(norm);
    if (norms.length > maxRun) {
      const window = norms.slice(-(maxRun + 1)).join(" ");
      if (corpus.includes(` ${window} `)) {
        kept.pop();
        norms.pop();
      }
    }
  }
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

function capitalisedTokens(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/\b[A-Z][a-z]{2,}\b/g)) {
    found.add(match[0].toLowerCase());
  }
  return found;
}

/**
 * Free-text pass for notice prose. Structured labels should not go through
 * this. Drops URLs, emails, phones, alphanumeric codes, proper nouns, org
 * tokens and places below NUTS1, then breaks verbatim source runs.
 */
export function redactFreeText(
  text: string | null | undefined,
  corpus: string,
  protectedTerms: string[],
): string | null {
  if (!text?.trim()) {
    return null;
  }
  const proper = capitalisedTokens(text);
  const protectedTokens = new Set(
    protectedTerms.flatMap((term) => leakTokens(term)).filter((word) => word.length >= 3),
  );
  const stripped = text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, " ")
    .replace(/\+?[0-9][0-9 ().-]{8,18}[0-9]/g, " ")
    .replace(/\b\d{8}(?:-\d)?\b/g, " ")
    .replace(/\b(?=[a-z]*\d)[a-z0-9][a-z0-9./-]{3,}\b/gi, " ");
  const words = leakTokens(stripped).filter((word) => {
    if (protectedTokens.has(word) || isBelowNuts1Place(word)) {
      return false;
    }
    if (proper.has(word) && !GENERIC.has(word)) {
      return false;
    }
    return true;
  });
  const broken = breakSourceRuns(words.join(" "), corpus);
  const result = broken.replace(/\s+/g, " ").trim();
  if (leakTokens(result).length < 3) {
    return null;
  }
  return result;
}

const QUANTITY_UNITS = [
  "devices",
  "device",
  "units",
  "unit",
  "items",
  "item",
  "users",
  "user",
  "licences",
  "licen[cs]es",
  "sites",
  "site",
  "vehicles",
  "vehicle",
  "tonnes",
  "tonne",
  "litres",
  "litre",
  "hours",
  "hour",
  "each",
  "sets",
  "set",
];

const QUANTITY_RE = new RegExp(
  `(?<![£$€\\d])\\b(\\d{1,4})\\s+(${QUANTITY_UNITS.join("|")})\\b`,
  "gi",
);

export function quantityPhrases(parts: Array<string | null | undefined>): string[] {
  const found = new Set<string>();
  for (const part of parts) {
    if (!part) {
      continue;
    }
    for (const match of part.matchAll(QUANTITY_RE)) {
      const amount = Number(match[1]);
      if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
        continue;
      }
      const unit = match[2].toLowerCase().replace(/licenses/g, "licences");
      found.add(`${amount} ${unit}`);
    }
  }
  return [...found].slice(0, 6);
}

const STANDARDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /iso\s*iec\s*27001|iso\s*27001/i, label: "ISO 27001 information security" },
  { pattern: /iso\s*9001/i, label: "ISO 9001 quality management" },
  { pattern: /iso\s*14001/i, label: "ISO 14001 environmental management" },
  { pattern: /cyber essentials plus/i, label: "Cyber Essentials Plus" },
  { pattern: /cyber essentials/i, label: "Cyber Essentials" },
  { pattern: /pas\s*91/i, label: "PAS 91 construction prequalification" },
  { pattern: /\bgdpr\b|data protection/i, label: "UK data-protection duties" },
];

export function standardLabels(parts: Array<string | null | undefined>): string[] {
  const blob = parts.filter(Boolean).join(" \n ");
  return STANDARDS.filter((item) => item.pattern.test(blob)).map((item) => item.label);
}
