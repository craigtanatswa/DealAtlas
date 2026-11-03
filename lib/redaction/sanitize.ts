import { sourceCorpus, redactFreeText } from "@/lib/preview/free-text";
import { leakTokens } from "@/lib/redaction/gate-normalize";

export type SanitisePreviewTextInput = {
  previewTitle: string;
  previewSummary: string;
  requirementsPreview?: string[];
  /** Source-derived text used to break verbatim/reverse-searchable runs. */
  sourceParts: Array<string | null | undefined>;
  /** Buyer/source names, domains, references and contact details to remove. */
  protectedTerms?: Array<string | null | undefined>;
  /** Tokens reported by the existing leak scanner, removed verbatim. */
  findingTokens?: string[];
};

export type SanitisedPreviewText = {
  previewTitle: string;
  previewSummary: string;
  requirementsPreview: string[];
};

const URL_RE = /(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const DOMAIN_RE =
  /\b(?:[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:ac\.uk|nhs\.uk|uk|com|net|org|gov|eu|io|info|scot|wales|cymru))\b/gi;
const OCID_RE = /\bocds-[a-z0-9]{3,}-[a-z0-9-]+\b/gi;
const TED_NOTICE_RE = /\b(?:19|20)[0-9]{2}\/S\s+[0-9]{3,}-[0-9]{4,}\b/gi;
const NOTICE_ID_RE = /\b[0-9]{6,}-[0-9]{4}\b/g;
const EIGHT_DIGIT_ID_RE = /\b[0-9]{8}\b/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const POSTCODE_RE = /\b[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/gi;
const PHONE_RE = /\+?[0-9][0-9 ().-]{8,18}[0-9]/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PORTAL_NAMES = [
  "Find a Tender",
  "Contracts Finder",
  "TED",
  "Sell2Wales",
  "Public Contracts Scotland",
  "Delta eSourcing",
  "ProContract",
  "In-Tend",
  "Jaggaer",
  "Bravo",
];

const PORTAL_RE = new RegExp(
  `(?<![A-Za-z0-9])(?:${PORTAL_NAMES.map(escapeRegExp).join("|")})(?![A-Za-z0-9])`,
  "gi",
);

function removeLiteral(text: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return text;
  }
  return text.replace(new RegExp(escapeRegExp(trimmed), "gi"), " ");
}

function stripIdentifiers(text: string, tokens: string[]): string {
  let stripped = text
    .replace(URL_RE, " ")
    .replace(EMAIL_RE, " ")
    .replace(DOMAIN_RE, " ")
    .replace(OCID_RE, " ")
    .replace(UUID_RE, " ")
    .replace(TED_NOTICE_RE, " ")
    .replace(NOTICE_ID_RE, " ")
    .replace(EIGHT_DIGIT_ID_RE, " ")
    .replace(PORTAL_RE, " ")
    .replace(POSTCODE_RE, " ")
    .replace(PHONE_RE, " ");
  for (const token of tokens) {
    stripped = removeLiteral(stripped, token);
  }
  return stripped;
}

function sanitiseText(
  text: string | null | undefined,
  corpus: string,
  protectedTerms: string[],
): string | null {
  if (!text?.trim()) {
    return null;
  }
  return redactFreeText(stripIdentifiers(text, protectedTerms), corpus, protectedTerms);
}

function sanitiseRequirement(
  line: string,
  corpus: string,
  protectedTerms: string[],
): string | null {
  const separator = line.indexOf(": ");
  const prefix = separator > 0 ? line.slice(0, separator) : "";
  const body = separator > 0 ? line.slice(separator + 2) : line;
  if (prefix && !/^[a-z][A-Za-z0-9]+$/.test(prefix)) {
    return sanitiseText(line, corpus, protectedTerms);
  }
  const cleaned = sanitiseText(body, corpus, protectedTerms);
  return cleaned ? (prefix ? `${prefix}: ${cleaned}` : cleaned) : null;
}

function capitaliseTitle(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Best-effort removal of identifying literal text from preview-owned fields.
 * It only removes text; the unchanged leak scanner still decides whether the
 * result may publish. Returns null when nothing usable survives.
 */
export function sanitisePreviewText(
  input: SanitisePreviewTextInput,
): SanitisedPreviewText | null {
  const corpus = sourceCorpus(input.sourceParts);
  const protectedTerms = [
    ...(input.protectedTerms ?? []),
    ...(input.findingTokens ?? []),
  ]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
  const title = sanitiseText(input.previewTitle, corpus, protectedTerms);
  const summary = sanitiseText(input.previewSummary, corpus, protectedTerms);
  if (!title || !summary) {
    return null;
  }
  const requirements = (input.requirementsPreview ?? [])
    .map((line) => sanitiseRequirement(line, corpus, protectedTerms))
    .filter((line): line is string => Boolean(line));
  const output = {
    previewTitle: capitaliseTitle(title),
    previewSummary: summary,
    requirementsPreview: requirements,
  };
  if (leakTokens(output.previewTitle).length < 3 || leakTokens(output.previewSummary).length < 3) {
    return null;
  }
  return output;
}
