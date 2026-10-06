import { BROAD_REGIONS } from "@/lib/preview/region";
import {
  BROAD_LOCATION_TERMS,
  GENERIC_ACRONYMS,
  GENERIC_ORG_TOKENS,
  GENERIC_PROPER_WORDS,
  PHRASE_STOPWORDS,
  POSTCODE_LIKE_ALLOWLIST,
  REFERENCE_PREFIX_ALLOWLIST,
  SOURCE_PLATFORM_MARKERS,
} from "@/lib/redaction/gate-vocabulary";
import {
  containsNorm,
  leakMatchName,
  leakNorm,
  leakTokens,
  pgTrgmSimilarity,
  postcodeOutward,
  sourceDateCandidates,
} from "@/lib/redaction/gate-normalize";
import { wordShingleSimilarity } from "@/lib/redaction/similarity";

export const TITLE_SIMILARITY_REVIEW = 0.8;
export const TITLE_SIMILARITY_HIGH = 0.9;
export const DESCRIPTION_SIMILARITY_REVIEW = 0.55;
export const DESCRIPTION_SIMILARITY_HIGH = 0.85;

export type LeakageRisk = "LOW" | "REVIEW" | "HIGH";

/**
 * Finding codes shared with `private.preview_leak_findings` (migration 0018).
 * `COMBINATION`, `SOURCE_RARE_WORD` and `DEAL_MISSING` need the whole corpus and
 * are database-only.
 */
export type LeakFindingCode =
  | "DEAL_MISSING"
  | "URL"
  | "EMAIL"
  | "DOMAIN"
  | "PHONE"
  | "OCID"
  | "REFERENCE_ID"
  | "REFERENCE_PATTERN"
  | "DATE_EXACT"
  | "DATE_SOURCE"
  | "POSTCODE"
  | "POSTCODE_KNOWN_OUTWARD"
  | "POSTCODE_OUTWARD"
  | "LOCATION_EXACT"
  | "LOCATION_TOKEN"
  | "BUYER_NAME"
  | "BUYER_ALIAS"
  | "BUYER_ACRONYM"
  | "BUYER_DOMAIN"
  | "BUYER_TOKEN"
  | "ORG_NAME"
  | "ORG_TOKEN"
  | "ORG_SUFFIX"
  | "PROJECT_NAME"
  | "ACRONYM"
  | "PROPER_NOUN_RUN"
  | "SOURCE_NAME_TOKEN"
  | "SOURCE_RARE_WORD"
  | "TITLE_SIMILARITY"
  | "SLUG_SIMILARITY"
  | "DESCRIPTION_SIMILARITY"
  | "PHRASE_OVERLAP"
  | "EXACT_AMOUNT"
  | "SOURCE_PLATFORM"
  | "BROAD_REGION"
  | "COMBINATION";

export type LeakFinding = {
  code: LeakFindingCode;
  risk: Exclude<LeakageRisk, "LOW">;
  detail: string;
  token?: string;
};

export type LeakScanInput = {
  previewTitle: string;
  previewSummary: string;
  requirementsPreview: string[];
  relevanceTags?: string[];
  /** Published slug; its trailing 8 random hex characters are ignored. */
  slug?: string | null;
  broadRegion?: string | null;
  sourceTitle: string;
  sourceDescription: string | null;
  /** Other source-derived text: lot titles/descriptions, requirement names, project scope. */
  sourceExtraText?: string[];
  ocid: string | null;
  reference: string | null;
  externalPrimaryId: string | null;
  noticeIdentifiers?: string[];
  /** Other identifiers: contract/award/lot ids, RFP/RFQ numbers, buyer org identifiers. */
  extraReferences?: string[];
  sourceUrl: string | null;
  applicationUrl: string | null;
  sourceName: string | null;
  sourceKey: string | null;
  buyerName: string | null;
  buyerAliases: string[];
  buyerDomain: string | null;
  buyerWebsite?: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  /** Suppliers, incumbents and other organisations linked to the deal. */
  linkedOrganizationNames?: string[];
  /** Every known organisation name/alias; defaults to buyer + linked names. */
  organizationNames?: string[];
  projectName?: string | null;
  exactValueText: string | null;
  valueMinExVat: number | null;
  valueMaxExVat: number | null;
  sourceAmounts?: Array<number | null>;
  submissionDeadline: string | null;
  /** Other source dates/timestamps (deadlines, contract dates, publication). */
  sourceDates?: Array<string | null>;
  exactLocationText: string | null;
  lotLocationTexts?: Array<string | null>;
  /** Unsplit place terms: buyer city/county/address lines, location cities/counties. */
  locationTerms?: Array<string | null>;
  knownPostcodes?: Array<string | null>;
};

export type LeakScanResult = {
  risk: LeakageRisk;
  findings: LeakFinding[];
};

const GENERIC_ORG = new Set<string>(GENERIC_ORG_TOKENS);
const GENERIC_ACR = new Set<string>(GENERIC_ACRONYMS);
const GENERIC_PROPER = new Set<string>(GENERIC_PROPER_WORDS);
const BROAD = new Set<string>(BROAD_LOCATION_TERMS);
const REF_PREFIX = new Set<string>(REFERENCE_PREFIX_ALLOWLIST);
const POSTCODE_LIKE = new Set<string>(POSTCODE_LIKE_ALLOWLIST);
const STOP = new Set<string>(PHRASE_STOPWORDS);
const ACRONYM_SKIP = new Set(["and", "of", "the", "for"]);

const DATE_EXACT_RES = [
  /\b([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?))\b/gi,
  /\b([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:of\s+)?may,?\s+(?:19|20)[0-9]{2})\b/gi,
  /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+[0-3]?[0-9](?:st|nd|rd|th)?)\b/gi,
  /\b(may\s+[0-3]?[0-9](?:st|nd|rd|th)?,?\s+(?:19|20)[0-9]{2})\b/gi,
  /\b([0-3]?[0-9][/.-][01]?[0-9][/.-](?:19|20)?[0-9]{2})\b/gi,
  /\b((?:19|20)[0-9]{2}[/.-][01]?[0-9][/.-][0-3]?[0-9])\b/gi,
  /\b([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:of\s+)?may)\b(?!\s+(?:be|not|also|apply|have|include|need|require|vary|change|only|still|well)\b)/gi,
  /\b(may\s+[0-3]?[0-9](?:st|nd|rd|th)?)\b/gi,
  /(?<![0-9/.])((?:0?[1-9]|[12][0-9]|3[01])\/(?:0?[1-9]|1[0-2]))(?![0-9/])/gi,
  /\b([0-3]?[0-9]-(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:-(?:19|20)?[0-9]{2})?)\b/gi,
];

const YEARLESS_NUMERIC_DATE = /^[0-9]+[/. -][0-9]+$/;

const POSTCODE_RE = /\b([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\b/gi;

// Short all-letter markers ("intend", "bravo") are ordinary words inside
// longer ones ("intended", "superintendent"), so they match whole words only.
function platformSubstringOk(marker: string): boolean {
  return /[^a-z ]/.test(marker) || marker.replace(/ /g, "").length >= 8;
}

function matches(text: string, re: RegExp): RegExpExecArray[] {
  return [...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))];
}

function isDistinctiveNameToken(word: string): boolean {
  return (
    word.length >= 4 &&
    !/^[0-9]+$/.test(word) &&
    !GENERIC_ORG.has(word) &&
    !GENERIC_PROPER.has(word) &&
    !BROAD.has(word) &&
    !STOP.has(word)
  );
}

function hostOf(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const host = value.toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+).*$/, "$1");
  return host.replace(/^www\./, "");
}

function wordIn(norm: string, word: string): boolean {
  return norm.includes(` ${word} `);
}

function initials(tokens: string[]): string {
  return tokens
    .filter((word) => !ACRONYM_SKIP.has(word) && !/^[0-9]+$/.test(word))
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function isGenericWord(word: string): boolean {
  return GENERIC_ORG.has(word) || GENERIC_PROPER.has(word) || BROAD.has(word) || STOP.has(word);
}

/**
 * Names the source uses: standalone acronyms (outside all-caps fields and
 * all-caps runs) and capitalised words that follow a lowercase word and never
 * appear in lowercase. Returned lowercase so slugs and lowercased prose are
 * matched too.
 */
function sourceNameTokens(parts: string[], raw: string): { acronyms: Set<string>; names: Set<string> } {
  const acronyms = new Set<string>();
  const names = new Set<string>();
  for (const part of parts) {
    const upper = part.replace(/[^A-Z]/g, "").length;
    const letters = part.replace(/[^A-Za-z]/g, "").length;
    if (upper * 2 <= letters) {
      const standalone = part.replace(/\b[A-Z][A-Z0-9&]*(?:\s+[A-Z][A-Z0-9&]*\b)+/g, " ");
      for (const m of matches(standalone, /\b([A-Z][A-Z0-9]{2,5})\b/g)) {
        const word = m[1];
        const lower = word.toLowerCase();
        if (
          !GENERIC_ACR.has(word) &&
          !isGenericWord(lower) &&
          matches(raw, new RegExp(`\\b(${word})\\b`, "gi")).every((other) => other[1] === word)
        ) {
          acronyms.add(lower);
        }
      }
    }
    for (const m of matches(part, /\b[a-z][a-z0-9'-]*[,;:)]?\s+([A-Z][a-z]{3,})\b/g)) {
      const lower = m[1].toLowerCase();
      if (!isGenericWord(lower) && !new RegExp(`\\b${lower}\\b`).test(raw)) {
        names.add(lower);
      }
    }
  }
  return { acronyms, names };
}

function raise(findings: LeakFinding[]): LeakageRisk {
  if (findings.some((item) => item.risk === "HIGH")) {
    return "HIGH";
  }
  return findings.length > 0 ? "REVIEW" : "LOW";
}

export function scanPreviewLeaks(input: LeakScanInput): LeakScanResult {
  const findings: LeakFinding[] = [];
  const push = (code: LeakFindingCode, risk: LeakFinding["risk"], detail: string, token?: string) =>
    findings.push({ code, risk, detail, ...(token === undefined ? {} : { token }) });

  const requirements = input.requirementsPreview.map((item) => item.trim()).filter(Boolean);
  const proseSegments = [input.previewSummary.trim(), ...requirements].filter(Boolean);
  const segments = [input.previewTitle.trim(), ...proseSegments].filter(Boolean);
  const slug = (input.slug ?? "").toLowerCase().replace(/-[0-9a-f]{8}$/, "");
  const slugNorm = leakNorm(slug);
  const slugTokens = leakTokens(slug);
  const tags = input.relevanceTags ?? [];
  const textCs = [segments.join(" . "), tags.join(" . ")].filter(Boolean).join(" . ");
  const all = [textCs, slug].filter(Boolean).join(" . ");
  const allLower = all.toLowerCase();
  const allNorm = leakNorm(all);
  const csTokens = new Set(textCs.match(/[A-Za-z0-9&]+/g) ?? []);

  const sourceParts = [input.sourceTitle, input.sourceDescription, ...(input.sourceExtraText ?? [])].filter(
    (item): item is string => Boolean(item),
  );
  const sourceRaw = sourceParts.join(" . ");
  const sourceNorm = leakNorm(sourceRaw);
  const { acronyms: sourceAcronyms, names: sourceNames } = sourceNameTokens(sourceParts, sourceRaw);

  // Direct identifiers -------------------------------------------------------
  for (const m of matches(all, /((?:https?:\/\/|www\.)\S+)/gi)) {
    push("URL", "HIGH", "Preview contains a URL", m[1].slice(0, 120));
  }
  for (const m of matches(all, /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)) {
    push("EMAIL", "HIGH", "Preview contains an email address", m[1].slice(0, 120));
  }
  for (const m of matches(
    all,
    /\b([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:uk|com|org|gov|eu|io|info|scot|wales|cymru))\b/gi,
  )) {
    push("DOMAIN", "HIGH", "Preview contains a web domain", m[1].slice(0, 120));
  }
  for (const m of matches(all, /(\+?[0-9][0-9 ().-]{8,18}[0-9])/g)) {
    const digits = m[1].replace(/[^0-9]/g, "");
    if (digits.length >= 10 && digits.length <= 13 && (digits.startsWith("0") || digits.startsWith("44"))) {
      push("PHONE", "HIGH", "Preview contains a phone number", m[1]);
    }
  }
  for (const m of matches(all, /\b(ocds-[a-z0-9]{3,}-[a-z0-9-]+)/gi)) {
    push("OCID", "HIGH", "Preview contains an OCID", m[1]);
  }
  for (const m of matches(all, /\b([0-9]{6,}-[0-9]{4})\b/g)) {
    push("REFERENCE_ID", "HIGH", "Preview contains a notice-style identifier", m[1]);
  }
  for (const m of matches(all, /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi)) {
    push("REFERENCE_ID", "HIGH", "Preview contains a UUID identifier", m[1]);
  }
  const references = new Set(
    [
      input.reference,
      input.ocid,
      input.externalPrimaryId,
      ...(input.noticeIdentifiers ?? []),
      ...(input.extraReferences ?? []),
    ]
      .filter((item): item is string => Boolean(item))
      .map((item) => item.trim()),
  );
  for (const reference of references) {
    const norm = leakNorm(reference);
    if (/[0-9]/.test(reference) && norm.trim().length >= 5 && allNorm.includes(norm)) {
      push("REFERENCE_ID", "HIGH", "Preview contains a source reference identifier", reference);
    }
  }
  for (const m of matches(all, /\b(([A-Za-z]{1,6})[-/_.]?[0-9]{3,}(?:[-/_.][A-Za-z0-9]+)*)\b/g)) {
    if (!REF_PREFIX.has(m[2].toLowerCase())) {
      push("REFERENCE_PATTERN", "REVIEW", "Preview contains a reference-shaped code", m[1]);
    }
  }

  // Dates --------------------------------------------------------------------
  for (const re of DATE_EXACT_RES) {
    for (const m of matches(all, re)) {
      if (m[1] !== "24/7") {
        push("DATE_EXACT", "REVIEW", "Preview contains an exact date", m[1]);
      }
    }
  }
  for (const candidate of sourceDateCandidates([input.submissionDeadline, ...(input.sourceDates ?? [])])) {
    const found = YEARLESS_NUMERIC_DATE.test(candidate)
      ? new RegExp(`(?<![0-9/.,])${candidate.replace(/\./g, "[.]")}(?![0-9]|[/.,][0-9])`).test(allLower)
      : containsNorm(allNorm, candidate);
    if (found) {
      push("DATE_SOURCE", "HIGH", "Preview contains a source date", candidate);
    }
  }

  // Postcodes and places -----------------------------------------------------
  for (const m of matches(all, POSTCODE_RE)) {
    push("POSTCODE", "HIGH", "Preview contains a postcode", m[1]);
  }
  const knownOutwards = new Set(
    [
      ...(input.knownPostcodes ?? []),
      ...matches(`${sourceRaw} ${input.exactLocationText ?? ""}`, POSTCODE_RE).map((m) => m[1]),
    ]
      .map((item) => postcodeOutward(item))
      .filter((item): item is string => Boolean(item)),
  );
  for (const outward of knownOutwards) {
    if (new RegExp(`\\b${outward}\\b`, "i").test(all)) {
      push("POSTCODE_KNOWN_OUTWARD", "HIGH", "Preview contains a source postcode area", outward);
    }
  }
  for (const m of matches(textCs, /\b([A-Z]{1,2}[0-9][A-Z0-9]?)\b/g)) {
    if (!POSTCODE_LIKE.has(m[1])) {
      push("POSTCODE_OUTWARD", "REVIEW", "Preview contains a postcode-shaped token", m[1]);
    }
  }
  for (const word of slugTokens) {
    if (/^[a-z]{1,2}[0-9][a-z0-9]?$/.test(word) && !POSTCODE_LIKE.has(word.toUpperCase())) {
      push("POSTCODE_OUTWARD", "REVIEW", "Slug contains a postcode-shaped token", word.toUpperCase());
    }
  }
  const regionNorm = leakNorm(input.broadRegion);
  const locationParts = new Set(
    [
      ...[input.exactLocationText, ...(input.lotLocationTexts ?? [])]
        .filter((item): item is string => Boolean(item))
        .flatMap((item) => item.split(/[,;/|()]/)),
      ...(input.locationTerms ?? []).filter((item): item is string => Boolean(item)),
    ].map((item) => item.trim()),
  );
  for (const part of locationParts) {
    const norm = leakNorm(part);
    const tokens = leakTokens(part);
    if (
      norm.trim().length >= 4 &&
      !BROAD.has(norm.trim()) &&
      norm !== regionNorm &&
      tokens.some((word) => !GENERIC_ORG.has(word) && !BROAD.has(word) && !/^[0-9]+$/.test(word)) &&
      allNorm.includes(norm)
    ) {
      push("LOCATION_EXACT", "HIGH", "Preview contains an exact source location", part);
    }
    for (const word of tokens) {
      if (
        word.length >= 4 &&
        !/[0-9]/.test(word) &&
        !isGenericWord(word) &&
        !wordIn(regionNorm, word) &&
        wordIn(allNorm, word)
      ) {
        push(
          "LOCATION_TOKEN",
          word.length >= 5 ? "HIGH" : "REVIEW",
          "Preview contains a word of an exact source location",
          word,
        );
      }
    }
  }

  // Buyer identity -----------------------------------------------------------
  if (input.buyerName) {
    const nameNorm = leakNorm(input.buyerName);
    const matchName = leakMatchName(input.buyerName);
    if (
      (nameNorm.trim().length >= 3 && allNorm.includes(nameNorm)) ||
      (matchName && allNorm.includes(matchName))
    ) {
      push("BUYER_NAME", "HIGH", "Preview contains the canonical buyer name", input.buyerName);
    }
  }
  for (const alias of input.buyerAliases) {
    const label = alias.replace(/\./g, "");
    // Acronym-style aliases: all caps, or mixed case with two or more capitals.
    if (
      /^[A-Za-z0-9&]{2,12}$/.test(label) &&
      ((/[A-Z]/.test(label) && !/[a-z]/.test(label)) || /[A-Z][^A-Z]*[A-Z]/.test(label))
    ) {
      const lower = label.toLowerCase();
      if (
        csTokens.has(label) ||
        (label.length >= 3 &&
          !GENERIC_ACR.has(label.toUpperCase()) &&
          !GENERIC_ORG.has(lower) &&
          !GENERIC_PROPER.has(lower) &&
          !STOP.has(lower) &&
          containsNorm(allNorm, label))
      ) {
        push("BUYER_ACRONYM", "HIGH", "Preview contains a buyer acronym", alias);
      }
      continue;
    }
    const norm = leakNorm(alias);
    const trimmed = norm.trim();
    if (
      trimmed.length >= 4 &&
      leakTokens(alias).some((word) => !GENERIC_ORG.has(word) && !BROAD.has(word)) &&
      allNorm.includes(norm)
    ) {
      push("BUYER_ALIAS", "HIGH", "Preview contains a buyer alias", alias);
    } else if (
      trimmed.length >= 2 &&
      trimmed.length <= 3 &&
      !GENERIC_ORG.has(trimmed) &&
      !BROAD.has(trimmed) &&
      !STOP.has(trimmed) &&
      !GENERIC_ACR.has(trimmed.toUpperCase()) &&
      allNorm.includes(norm)
    ) {
      push("BUYER_ALIAS", "REVIEW", "Preview may contain a short buyer alias", alias);
    }
  }
  if (input.buyerName) {
    const buyerHosts = new Set(
      [
        input.buyerDomain?.replace(/^www\./, "").toLowerCase() ?? null,
        hostOf(input.buyerWebsite),
        input.buyerEmail?.split("@")[1]?.replace(/^www\./, "").toLowerCase() ?? null,
      ].filter((item): item is string => Boolean(item && item.length >= 4)),
    );
    for (const host of buyerHosts) {
      if (allLower.includes(host)) {
        push("BUYER_DOMAIN", "HIGH", "Preview contains a buyer domain", host);
        continue;
      }
      const stem = host.split(".")[0];
      if (stem.length >= 5 && !GENERIC_ORG.has(stem) && wordIn(allNorm, stem)) {
        push("BUYER_DOMAIN", "HIGH", "Preview contains a buyer domain name", stem);
      }
    }
    for (const word of new Set(leakTokens(input.buyerName))) {
      if (isDistinctiveNameToken(word) && wordIn(allNorm, word)) {
        push("BUYER_TOKEN", word.length >= 5 ? "HIGH" : "REVIEW", "Preview contains part of the buyer name", word);
      }
    }
    const matchTokens = leakTokens(leakMatchName(input.buyerName));
    for (const acronym of new Set([initials(leakTokens(input.buyerName)), initials(matchTokens)])) {
      if (
        acronym.length >= 3 &&
        (csTokens.has(acronym) || (acronym.length >= 4 && slugTokens.includes(acronym.toLowerCase())))
      ) {
        push("BUYER_ACRONYM", "HIGH", "Preview contains the buyer's initials", acronym);
      }
    }
  }
  for (const url of [input.sourceUrl, input.applicationUrl]) {
    const host = hostOf(url);
    if (host && host.length >= 4 && allLower.includes(host)) {
      push("BUYER_DOMAIN", "HIGH", "Preview contains a source domain", host);
    }
  }

  // Any known organisation ---------------------------------------------------
  const linked = input.linkedOrganizationNames ?? [];
  const organizationNames =
    input.organizationNames ??
    [input.buyerName, ...input.buyerAliases, ...linked].filter((item): item is string => Boolean(item));
  for (const name of new Set(organizationNames)) {
    const matchName = leakMatchName(name);
    if (!matchName || !allNorm.includes(matchName)) {
      continue;
    }
    const short = matchName.trim().length < 5;
    const distinctive = leakTokens(matchName).filter(
      (word) =>
        !GENERIC_ORG.has(word) &&
        !BROAD.has(word) &&
        !STOP.has(word) &&
        !/^[0-9]+$/.test(word) &&
        (!short || (!GENERIC_ACR.has(word.toUpperCase()) && !GENERIC_PROPER.has(word))),
    ).length;
    if (distinctive >= 2) {
      push("ORG_NAME", "HIGH", "Preview contains a known organisation name", name);
    } else if (distinctive === 1) {
      push("ORG_NAME", "REVIEW", "Preview may contain a known organisation name", name);
    }
  }
  for (const word of new Set(linked.flatMap((name) => leakTokens(name)))) {
    if (isDistinctiveNameToken(word) && wordIn(allNorm, word)) {
      push("ORG_TOKEN", word.length >= 5 ? "HIGH" : "REVIEW", "Preview contains part of a linked organisation name", word);
    }
  }
  for (const m of matches(
    textCs,
    /((?:[A-Z][A-Za-z0-9&-]*\s+){1,4}(?:Ltd|LTD|Limited|LIMITED|LLP|PLC|Plc|plc|LLC|Inc|CIC))\b/g,
  )) {
    push("ORG_SUFFIX", "HIGH", "Preview names a company", m[1]);
  }
  for (const m of matches(all, /\b(ltd|llp)\b/gi)) {
    push("ORG_SUFFIX", "HIGH", "Preview contains a company suffix", m[1]);
  }

  // Project / programme names ------------------------------------------------
  if (input.projectName) {
    const norm = leakNorm(input.projectName);
    if (norm.trim().length >= 5 && allNorm.includes(norm)) {
      push("PROJECT_NAME", "HIGH", "Preview contains the project name", input.projectName);
    }
    for (const word of new Set(leakTokens(input.projectName))) {
      if (isDistinctiveNameToken(word) && wordIn(allNorm, word)) {
        push("PROJECT_NAME", word.length >= 5 ? "HIGH" : "REVIEW", "Preview contains part of the project name", word);
      }
    }
  }
  for (const m of matches(textCs, /\b([A-Z][A-Z0-9&]{2,})\b/g)) {
    if (GENERIC_ACR.has(m[1])) {
      continue;
    }
    const norm = leakNorm(m[1]);
    const carried = norm.trim().length >= 3 && sourceNorm.includes(norm);
    push("ACRONYM", carried ? "HIGH" : "REVIEW", "Preview contains an uncommon acronym", m[1]);
  }
  for (const segment of proseSegments) {
    for (const m of matches(segment, /\b[a-z][a-z0-9'-]*[,;:)]?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g)) {
      const distinctive = leakTokens(m[1]).some(
        (word) => !GENERIC_PROPER.has(word) && !GENERIC_ORG.has(word) && !BROAD.has(word),
      );
      if (distinctive) {
        push(
          "PROPER_NOUN_RUN",
          sourceNorm.includes(leakNorm(m[1])) ? "HIGH" : "REVIEW",
          "Preview contains a proper-noun run",
          m[1],
        );
      }
    }
  }

  for (const word of sourceAcronyms) {
    if (wordIn(allNorm, word)) {
      push("SOURCE_NAME_TOKEN", "HIGH", "Preview contains a source acronym", word);
    }
  }
  for (const word of sourceNames) {
    if (wordIn(allNorm, word)) {
      push("SOURCE_NAME_TOKEN", word.length >= 5 ? "HIGH" : "REVIEW", "Preview contains a source name", word);
    }
  }

  // Similarity and copied phrases -------------------------------------------
  if (input.sourceTitle.trim().length >= 4) {
    let titleSimilarity = pgTrgmSimilarity(input.sourceTitle, input.previewTitle);
    if (input.sourceTitle.trim().length >= 20) {
      titleSimilarity = Math.max(
        titleSimilarity,
        wordShingleSimilarity(input.sourceTitle, input.previewTitle, 3),
      );
    }
    if (titleSimilarity >= TITLE_SIMILARITY_HIGH) {
      push("TITLE_SIMILARITY", "HIGH", `Preview title is nearly verbatim (${titleSimilarity.toFixed(2)})`);
    } else if (titleSimilarity >= TITLE_SIMILARITY_REVIEW) {
      push("TITLE_SIMILARITY", "REVIEW", `Preview title is excessively similar to the source title (${titleSimilarity.toFixed(2)})`);
    }
    if (slugNorm.trim()) {
      const slugSimilarity = pgTrgmSimilarity(input.sourceTitle, slugNorm.trim());
      if (slugSimilarity >= TITLE_SIMILARITY_HIGH) {
        push("SLUG_SIMILARITY", "HIGH", `Slug is nearly the source title (${slugSimilarity.toFixed(2)})`);
      } else if (slugSimilarity >= TITLE_SIMILARITY_REVIEW) {
        push("SLUG_SIMILARITY", "REVIEW", `Slug is excessively similar to the source title (${slugSimilarity.toFixed(2)})`);
      }
    }
  }
  if ((input.sourceDescription ?? "").trim().length >= 40) {
    const descriptionSimilarity = Math.max(
      pgTrgmSimilarity(input.sourceDescription ?? "", input.previewSummary),
      wordShingleSimilarity(input.sourceDescription ?? "", input.previewSummary, 4),
    );
    if (descriptionSimilarity >= DESCRIPTION_SIMILARITY_HIGH) {
      push("DESCRIPTION_SIMILARITY", "HIGH", `Preview summary is nearly verbatim (${descriptionSimilarity.toFixed(2)})`);
    } else if (descriptionSimilarity >= DESCRIPTION_SIMILARITY_REVIEW) {
      push(
        "DESCRIPTION_SIMILARITY",
        "REVIEW",
        `Preview summary is excessively similar to the source description (${descriptionSimilarity.toFixed(2)})`,
      );
    }
  }
  for (const segment of segments) {
    const words = leakTokens(segment);
    for (let index = 0; index + 6 <= words.length; index += 1) {
      const window = words.slice(index, index + 6);
      if (window.filter((word) => !STOP.has(word)).length >= 2 && sourceNorm.includes(` ${window.join(" ")} `)) {
        push("PHRASE_OVERLAP", "HIGH", "Preview copies a six-word source phrase", window.join(" "));
        break;
      }
    }
  }

  // Exact amounts ------------------------------------------------------------
  const amounts = new Set(
    [
      ...[input.valueMinExVat, input.valueMaxExVat, ...(input.sourceAmounts ?? [])]
        .filter((value): value is number => value != null && Number.isFinite(value))
        .map((value) => String(Math.round(value))),
      input.exactValueText ? input.exactValueText.replace(/[^0-9]/g, "") : "",
    ].filter((item) => item.length >= 5),
  );
  for (const m of matches(all, /(£\s?[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)/g)) {
    push("EXACT_AMOUNT", "HIGH", "Preview contains an exact amount", m[1]);
  }
  for (const m of matches(all, /\b([0-9]{5,}(?:\.[0-9]{1,2})?)\b/g)) {
    if (amounts.has(m[1].split(".")[0])) {
      push("EXACT_AMOUNT", "HIGH", "Preview contains an exact source amount", m[1]);
    }
  }

  // Source platform ----------------------------------------------------------
  const sourceMarkers = [
    input.sourceName?.toLowerCase(),
    input.sourceKey?.toLowerCase(),
    input.sourceKey?.toLowerCase().replace(/-/g, " "),
  ].filter(
    (item): item is string =>
      Boolean(item) &&
      (item as string).length >= 5 &&
      leakTokens(item).some((word) => !GENERIC_ORG.has(word) && !BROAD.has(word)),
  );
  for (const marker of new Set([...SOURCE_PLATFORM_MARKERS, ...sourceMarkers])) {
    if ((platformSubstringOk(marker) && allLower.includes(marker)) || containsNorm(allNorm, marker)) {
      push("SOURCE_PLATFORM", "HIGH", "Preview contains a source-platform identifier", marker);
    }
  }

  // broad_region is shown verbatim on cards, so it must be one of the fixed regions.
  const region = input.broadRegion?.trim();
  if (region && !(BROAD_REGIONS as readonly string[]).includes(region)) {
    push("BROAD_REGION", "HIGH", "Preview region is not a listed broad region", region);
  }

  const unique = findings.filter(
    (finding, index) =>
      findings.findIndex(
        (other) =>
          other.code === finding.code &&
          other.token === finding.token &&
          other.risk === finding.risk,
      ) === index,
  );
  return { risk: raise(unique), findings: unique };
}
