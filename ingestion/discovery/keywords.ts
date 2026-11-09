import type { DiscoveryKeyword, DiscoveryPrefilter } from "@/ingestion/discovery/types";

export const DEFAULT_DISCOVERY_KEYWORDS = [
  "rfq",
  "rfp",
  "itt",
  "invitation to tender",
  "invitation to quote",
  "request for quotation",
  "request for proposal",
  "expression of interest",
  "eoi",
  "rfi",
  "seeking suppliers",
  "suppliers wanted",
  "supplier opportunity",
  "subcontract opportunity",
  "subcontractor wanted",
  "framework opportunity",
  "call for suppliers",
  "purchasing requirement",
  "preferred supplier",
  "procurement opportunity",
] as const;

const ONBOARDING_PATTERNS = [
  /\bregister\s+(?:as\s+|your\s+|to\s+become\s+)?(?:a\s+)?supplier\b/i,
  /\bsupplier\s+registration\b/i,
  /\bbecome\s+a\s+supplier\b/i,
  /\bsupplier\s+onboarding\b/i,
  /\bvendor\s+registration\b/i,
  /\bsupplier\s+portal\s+registration\b/i,
];

const JOB_PATTERNS = [
  /\bjob\s+vacanc(?:y|ies)\b/i,
  /\bjob\s+description\b/i,
  /\bapply\s+for\s+this\s+job\b/i,
  /\bwe\s+are\s+hiring\b/i,
  /\bjoin\s+our\s+team\b/i,
  /\bcareer\s+opportunit(?:y|ies)\b/i,
  /\b(?:full|part)[- ]time\s+(?:role|position)\b/i,
  /\bsalary\s*[:£$]/i,
];

const PRESS_PATTERNS = [
  /\bpress\s+release\b/i,
  /\bmedia\s+release\b/i,
  /\bnews\s+release\b/i,
  /\bappoints?\b/i,
  /\bcelebrates?\b/i,
  /\blaunches?\s+(?:a\s+)?new\s+(?:service|product|website)\b/i,
];

const AWARD_PATTERNS = [
  /\bcontract\s+award\s+notice\b/i,
  /\baward\s+(?:notice|decision)\b/i,
  /\bawarded\s+supplier\b/i,
  /\bstandstill\s+period\b/i,
];

const EXPIRED_PATTERNS = [
  /\bapplications?\s+(?:are\s+)?closed\b/i,
  /\bno\s+longer\s+accepting\b/i,
  /\bdeadline\s+(?:has\s+)?passed\b/i,
  /\bclosed\s+for\s+applications\b/i,
];

export function normalizeKeyword(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function keywordVocabulary(
  keywords: Array<Pick<DiscoveryKeyword, "keyword" | "enabled">> = DEFAULT_DISCOVERY_KEYWORDS.map(
    (keyword) => ({ keyword, enabled: true }),
  ),
): string[] {
  return [...new Set(
    keywords
      .filter((item) => item.enabled)
      .map((item) => normalizeKeyword(item.keyword))
      .filter((item) => item.length >= 2),
  )];
}

export function findKeywordMatches(text: string, keywords: string[]): string[] {
  const normalized = ` ${normalizeKeyword(text)} `;
  const matches: string[] = [];
  for (const keyword of keywords) {
    const needle = normalizeKeyword(keyword);
    if (!needle) {
      continue;
    }
    if (normalized.includes(` ${needle} `)) {
      matches.push(keyword);
    }
  }
  return matches;
}

function matchesAny(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      return match[0];
    }
  }
  return null;
}

export function prefilterOpportunity(input: {
  title: string;
  text: string;
  keywords?: string[];
}): DiscoveryPrefilter {
  const keywords = input.keywords ?? [...DEFAULT_DISCOVERY_KEYWORDS];
  const haystack = `${input.title}\n${input.text}`;
  const matchedKeywords = findKeywordMatches(haystack, keywords);
  const onboarding = matchesAny(haystack, ONBOARDING_PATTERNS);

  if (onboarding) {
    return {
      classify: true,
      onboarding: true,
      matchedKeywords,
      disqualifiers: ["supplier onboarding"],
      reason: "Supplier onboarding page, not a live opportunity",
    };
  }

  const disqualifiers = [
    ["job vacancy", matchesAny(haystack, JOB_PATTERNS)],
    ["news or press release", matchesAny(haystack, PRESS_PATTERNS)],
    ["award notice", matchesAny(haystack, AWARD_PATTERNS)],
    ["inactive or expired", matchesAny(haystack, EXPIRED_PATTERNS)],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  if (disqualifiers.length > 0) {
    return {
      classify: false,
      onboarding: false,
      matchedKeywords,
      disqualifiers: disqualifiers.map((item) => item[0]),
      reason: `${disqualifiers[0][0]}: ${disqualifiers[0][1]}`,
    };
  }

  if (matchedKeywords.length === 0) {
    return {
      classify: false,
      onboarding: false,
      matchedKeywords,
      disqualifiers: [],
      reason: "No procurement keyword matched",
    };
  }

  return {
    classify: true,
    onboarding: false,
    matchedKeywords,
    disqualifiers: [],
    reason: null,
  };
}
