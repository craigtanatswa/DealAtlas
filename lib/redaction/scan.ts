import { trigramSimilarity, wordShingleSimilarity } from "@/lib/redaction/similarity";

export const TITLE_SIMILARITY_REVIEW = 0.8;
export const TITLE_SIMILARITY_HIGH = 0.9;
export const DESCRIPTION_SIMILARITY_REVIEW = 0.55;
export const DESCRIPTION_SIMILARITY_HIGH = 0.85;

export type LeakageRisk = "LOW" | "REVIEW" | "HIGH";

export type LeakFindingCode =
  | "BUYER_NAME"
  | "BUYER_ALIAS"
  | "BUYER_DOMAIN"
  | "URL"
  | "EMAIL"
  | "PHONE"
  | "OCID"
  | "REFERENCE_ID"
  | "SOURCE_PLATFORM"
  | "TITLE_SIMILARITY"
  | "DESCRIPTION_SIMILARITY"
  | "FINGERPRINT";

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
  sourceTitle: string;
  sourceDescription: string | null;
  ocid: string | null;
  reference: string | null;
  externalPrimaryId: string | null;
  noticeIdentifiers?: string[];
  sourceUrl: string | null;
  applicationUrl: string | null;
  sourceName: string | null;
  sourceKey: string | null;
  buyerName: string | null;
  buyerAliases: string[];
  buyerDomain: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  exactValueText: string | null;
  valueMinExVat: number | null;
  valueMaxExVat: number | null;
  submissionDeadline: string | null;
  exactLocationText: string | null;
};

export type LeakScanResult = {
  risk: LeakageRisk;
  findings: LeakFinding[];
};

const EMAIL_RE = /\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const OCID_RE = /\bocds-[a-z0-9]{3,}-[a-z0-9\-]+\b/gi;
const NOTICE_ID_RE = /\b\d{6,}-\d{4}\b/g;
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const POSTCODE_RE = /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/gi;
const PHONE_RE =
  /(?<!\d)(?:\+|00)?(?:44)[\s().-]*(?:\d[\s().-]*){9,11}(?!\d)|(?<!\d)0[\s().-]*(?:\d[\s().-]*){9,10}(?!\d)/g;
const EXACT_MONEY_RE = /£\s?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\b\d{5,}(?:\.\d{1,2})?\b/g;

const GENERIC_NAME_TOKENS = new Set([
  "the",
  "and",
  "for",
  "group",
  "services",
  "service",
  "limited",
  "ltd",
  "plc",
  "council",
  "authority",
  "department",
  "office",
  "trust",
  "board",
  "agency",
  "company",
  "uk",
  "united",
  "kingdom",
]);

const SOURCE_PLATFORM_MARKERS = [
  "find a tender",
  "find-tender",
  "find-a-tender",
  "contracts finder",
  "contractsfinder",
  "sell2wales",
  "public contracts scotland",
  "etendersni",
  "e-tenders ni",
  "ted.europa.eu",
  "tenders electronic daily",
  "crown commercial service",
  "uk infrastructure pipeline",
  "nista",
];

function combinedText(input: LeakScanInput): string {
  return [
    input.previewTitle,
    input.previewSummary,
    ...input.requirementsPreview,
    ...(input.relevanceTags ?? []),
  ].join(" ");
}

function raise(findings: LeakFinding[]): LeakageRisk {
  if (findings.some((item) => item.risk === "HIGH")) {
    return "HIGH";
  }
  if (findings.length > 0) {
    return "REVIEW";
  }
  return "LOW";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhrase(haystack: string, needle: string): boolean {
  const trimmed = needle.trim();
  if (trimmed.length < 3) {
    return false;
  }
  if (trimmed.length <= 4 || !trimmed.includes(" ")) {
    return new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "i").test(haystack);
  }
  return haystack.toLowerCase().includes(trimmed.toLowerCase());
}

function isGenericAlias(value: string): boolean {
  const tokens = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => GENERIC_NAME_TOKENS.has(token));
}

function hostnameOf(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function amountDigits(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return String(Math.round(value));
}

function dateFingerprints(iso: string | null): string[] {
  if (!iso) {
    return [];
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return [iso];
  }
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const monthName = date.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  const day = date.getUTCDate();
  return [
    `${y}-${m}-${d}`,
    `${d}/${m}/${y}`,
    `${day} ${monthName} ${y}`,
    `${day} ${monthName.toLowerCase()} ${y}`,
    `${monthName} ${day}, ${y}`,
  ];
}

function locationTokens(exact: string | null): string[] {
  if (!exact) {
    return [];
  }
  return exact
    .split(/[,/|]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4)
    .filter((part) => !/\b(united kingdom|england|scotland|wales|northern ireland|uk)\b/i.test(part));
}

export function scanPreviewLeaks(input: LeakScanInput): LeakScanResult {
  const findings: LeakFinding[] = [];
  const haystack = combinedText(input);
  const lower = haystack.toLowerCase();

  const emails = haystack.match(EMAIL_RE) ?? [];
  for (const email of emails) {
    findings.push({
      code: "EMAIL",
      risk: "HIGH",
      detail: "Preview contains an email address",
      token: email,
    });
  }
  if (input.buyerEmail && containsPhrase(haystack, input.buyerEmail)) {
    findings.push({
      code: "EMAIL",
      risk: "HIGH",
      detail: "Preview contains the buyer email",
      token: input.buyerEmail,
    });
  }

  const urls = haystack.match(URL_RE) ?? [];
  for (const url of urls) {
    findings.push({
      code: "URL",
      risk: "HIGH",
      detail: "Preview contains a URL",
      token: url,
    });
  }

  const domains = [
    input.buyerDomain,
    hostnameOf(input.sourceUrl),
    hostnameOf(input.applicationUrl),
    hostnameOf(input.buyerDomain ? `https://${input.buyerDomain}` : null),
  ]
    .filter((item): item is string => Boolean(item))
    .map((item) => item.replace(/^www\./, "").toLowerCase());
  for (const domain of new Set(domains)) {
    if (domain.length >= 4 && lower.includes(domain)) {
      findings.push({
        code: "BUYER_DOMAIN",
        risk: "HIGH",
        detail: "Preview contains a buyer or source domain",
        token: domain,
      });
    }
  }

  const phones = haystack.match(PHONE_RE) ?? [];
  for (const phone of phones) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 10) {
      findings.push({
        code: "PHONE",
        risk: "HIGH",
        detail: "Preview contains an identifying phone number",
        token: phone.trim(),
      });
    }
  }
  if (input.buyerPhone) {
    const buyerDigits = input.buyerPhone.replace(/\D/g, "");
    if (buyerDigits.length >= 10 && haystack.replace(/\D/g, "").includes(buyerDigits)) {
      findings.push({
        code: "PHONE",
        risk: "HIGH",
        detail: "Preview contains the buyer phone number",
        token: input.buyerPhone,
      });
    }
  }

  const ocids = haystack.match(OCID_RE) ?? [];
  for (const ocid of ocids) {
    findings.push({
      code: "OCID",
      risk: "HIGH",
      detail: "Preview contains an OCID",
      token: ocid,
    });
  }
  if (input.ocid && input.ocid.length >= 6 && containsPhrase(haystack, input.ocid)) {
    findings.push({
      code: "OCID",
      risk: "HIGH",
      detail: "Preview contains the deal OCID",
      token: input.ocid,
    });
  }

  const referenceCandidates = [
    input.reference,
    input.externalPrimaryId,
    ...(input.noticeIdentifiers ?? []),
  ].filter((item): item is string => Boolean(item && item.length >= 6));
  for (const reference of referenceCandidates) {
    if (containsPhrase(haystack, reference)) {
      findings.push({
        code: "REFERENCE_ID",
        risk: "HIGH",
        detail: "Preview contains a source reference identifier",
        token: reference,
      });
    }
  }
  for (const noticeId of haystack.match(NOTICE_ID_RE) ?? []) {
    findings.push({
      code: "REFERENCE_ID",
      risk: "HIGH",
      detail: "Preview contains a notice-style identifier",
      token: noticeId,
    });
  }
  for (const uuid of haystack.match(UUID_RE) ?? []) {
    findings.push({
      code: "REFERENCE_ID",
      risk: "HIGH",
      detail: "Preview contains a UUID identifier",
      token: uuid,
    });
  }

  if (input.buyerName && input.buyerName.trim().length >= 3 && containsPhrase(haystack, input.buyerName)) {
    findings.push({
      code: "BUYER_NAME",
      risk: "HIGH",
      detail: "Preview contains the canonical buyer name",
      token: input.buyerName,
    });
  }
  for (const alias of input.buyerAliases) {
    if (!alias || alias.trim().length < 5 || isGenericAlias(alias)) {
      continue;
    }
    if (containsPhrase(haystack, alias)) {
      findings.push({
        code: "BUYER_ALIAS",
        risk: "HIGH",
        detail: "Preview contains a buyer alias",
        token: alias,
      });
    }
  }

  const platformNeedles = [
    ...SOURCE_PLATFORM_MARKERS,
    input.sourceName?.toLowerCase() ?? "",
    input.sourceKey?.replace(/-/g, " ") ?? "",
    input.sourceKey ?? "",
  ].filter((item) => item.length >= 5);
  for (const marker of new Set(platformNeedles)) {
    if (isGenericAlias(marker)) {
      continue;
    }
    if (lower.includes(marker.toLowerCase())) {
      findings.push({
        code: "SOURCE_PLATFORM",
        risk: "HIGH",
        detail: "Preview contains a source-platform identifier",
        token: marker,
      });
    }
  }

  if (input.sourceTitle.trim().length >= 20) {
    const titleSimilarity = Math.max(
      trigramSimilarity(input.sourceTitle, input.previewTitle),
      wordShingleSimilarity(input.sourceTitle, input.previewTitle, 3),
    );
    if (titleSimilarity >= TITLE_SIMILARITY_HIGH) {
      findings.push({
        code: "TITLE_SIMILARITY",
        risk: "HIGH",
        detail: `Preview title is nearly verbatim (${titleSimilarity.toFixed(2)})`,
      });
    } else if (titleSimilarity >= TITLE_SIMILARITY_REVIEW) {
      findings.push({
        code: "TITLE_SIMILARITY",
        risk: "REVIEW",
        detail: `Preview title is excessively similar to the source title (${titleSimilarity.toFixed(2)})`,
      });
    }
  }

  if ((input.sourceDescription ?? "").trim().length >= 40) {
    const descriptionSimilarity = Math.max(
      trigramSimilarity(input.sourceDescription ?? "", input.previewSummary),
      wordShingleSimilarity(input.sourceDescription ?? "", input.previewSummary, 4),
    );
    if (descriptionSimilarity >= DESCRIPTION_SIMILARITY_HIGH) {
      findings.push({
        code: "DESCRIPTION_SIMILARITY",
        risk: "HIGH",
        detail: `Preview summary is nearly verbatim (${descriptionSimilarity.toFixed(2)})`,
      });
    } else if (descriptionSimilarity >= DESCRIPTION_SIMILARITY_REVIEW) {
      findings.push({
        code: "DESCRIPTION_SIMILARITY",
        risk: "REVIEW",
        detail: `Preview summary is excessively similar to the source description (${descriptionSimilarity.toFixed(2)})`,
      });
    }
  }

  const fingerprintHits: string[] = [];
  const moneyMatches = haystack.match(EXACT_MONEY_RE) ?? [];
  const valueDigits = [
    amountDigits(input.valueMinExVat),
    amountDigits(input.valueMaxExVat),
    input.exactValueText ? input.exactValueText.replace(/\D/g, "") : null,
  ].filter((item): item is string => Boolean(item && item.length >= 5));
  for (const match of moneyMatches) {
    const digits = match.replace(/\D/g, "");
    if (valueDigits.includes(digits) || /£\s?\d{1,3}(?:,\d{3})+/.test(match)) {
      fingerprintHits.push("amount");
      findings.push({
        code: "FINGERPRINT",
        risk: "HIGH",
        detail: "Preview contains an exact source amount",
        token: match,
      });
    }
  }

  for (const stamp of dateFingerprints(input.submissionDeadline)) {
    if (containsPhrase(haystack, stamp)) {
      fingerprintHits.push("deadline");
      findings.push({
        code: "FINGERPRINT",
        risk: "HIGH",
        detail: "Preview contains an exact submission deadline",
        token: stamp,
      });
    }
  }

  for (const postcode of haystack.match(POSTCODE_RE) ?? []) {
    fingerprintHits.push("location");
    findings.push({
      code: "FINGERPRINT",
      risk: "HIGH",
      detail: "Preview contains a postcode",
      token: postcode,
    });
  }
  for (const token of locationTokens(input.exactLocationText)) {
    if (containsPhrase(haystack, token)) {
      fingerprintHits.push("location");
      findings.push({
        code: "FINGERPRINT",
        risk: "HIGH",
        detail: "Preview contains an exact source location",
        token: token,
      });
    }
  }

  if (new Set(fingerprintHits).size >= 2) {
    findings.push({
      code: "FINGERPRINT",
      risk: "HIGH",
      detail: "Preview combines exact amount, deadline and/or location fingerprints",
    });
  }

  const unique = findings.filter(
    (finding, index) =>
      findings.findIndex(
        (other) =>
          other.code === finding.code &&
          other.token === finding.token &&
          other.detail === finding.detail,
      ) === index,
  );
  return { risk: raise(unique), findings: unique };
}
