import { BROAD_REGIONS } from "@/lib/preview/region";
import { VALUE_BANDS, type ValueBand } from "@/lib/preview/bands";
import { resolveCategory } from "@/lib/matching/categories";
import type {
  CompanyMatchProfile,
  DealMatchScore,
  MatchComponentScores,
  MatchReason,
  MatchableDeal,
} from "@/lib/matching/types";

const WEIGHTS_WITH_SEMANTIC = {
  category: 22,
  keyword: 18,
  location: 14,
  value: 14,
  sector: 10,
  certification: 10,
  semantic: 12,
} as const;

const WEIGHTS_WITHOUT_SEMANTIC = {
  category: 25,
  keyword: 22,
  location: 16,
  value: 16,
  sector: 11,
  certification: 10,
} as const;

const NEGATIVE_KEYWORD_PENALTY = 40;

const VALUE_BAND_RANGES: Record<ValueBand, { min: number | null; max: number | null }> = {
  "Under £25k": { min: 0, max: 25_000 },
  "£25k–£50k": { min: 25_000, max: 50_000 },
  "£50k–£100k": { min: 50_000, max: 100_000 },
  "£100k–£250k": { min: 100_000, max: 250_000 },
  "£250k–£500k": { min: 250_000, max: 500_000 },
  "£500k–£1m": { min: 500_000, max: 1_000_000 },
  "£1m–£5m": { min: 1_000_000, max: 5_000_000 },
  "£5m–£10m": { min: 5_000_000, max: 10_000_000 },
  "£10m+": { min: 10_000_000, max: null },
  Undisclosed: { min: null, max: null },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeMatchText(value: string): string[] {
  return normalizeMatchText(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

export function haystackContainsPhrase(haystack: string, needle: string): boolean {
  const phrase = normalizeMatchText(needle);
  if (phrase.length < 2) {
    return false;
  }
  const hay = normalizeMatchText(haystack);
  if (!hay) {
    return false;
  }
  if (phrase.length <= 3 || !phrase.includes(" ")) {
    return new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i").test(hay);
  }
  return hay.includes(phrase);
}

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const key = normalizeMatchText(normalized);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function previewHaystack(deal: MatchableDeal): string {
  return [
    deal.previewTitle,
    deal.previewSummary,
    deal.mainCategory ?? "",
    deal.broadRegion ?? "",
    deal.valueBand ?? "",
    ...deal.relevanceTags,
    ...deal.requirementsPreview,
  ].join(" ");
}

function protectedHaystack(deal: MatchableDeal): string {
  return [
    ...(deal.requirementNames ?? []),
    ...(deal.commercialToolNames ?? []),
  ].join(" ");
}

function scoringHaystack(deal: MatchableDeal): string {
  return `${previewHaystack(deal)} ${protectedHaystack(deal)}`;
}

function profileHasPreferences(profile: CompanyMatchProfile): boolean {
  return Boolean(
    profile.companyDescription?.trim() ||
      profile.productsServices.length ||
      profile.preferredCategorySlugs.length ||
      profile.preferredCpvCodes.length ||
      profile.keywords.length ||
      profile.negativeKeywords.length ||
      profile.preferredRegions.length ||
      profile.preferredBuyerSectors.length ||
      profile.certifications.length ||
      profile.frameworkMemberships.length ||
      profile.minimumDealValue != null ||
      profile.maximumDealValue != null,
  );
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function cpvOverlap(preferred: string[], dealCodes: string[]): number | null {
  const wanted = preferred.map(digitsOnly).filter((code) => code.length >= 2);
  const got = dealCodes.map(digitsOnly).filter((code) => code.length >= 2);
  if (wanted.length === 0) {
    return null;
  }
  if (got.length === 0) {
    return 20;
  }
  let best = 0;
  for (const needle of wanted) {
    for (const hay of got) {
      const prefixLength = commonPrefixLength(needle, hay);
      if (prefixLength >= 8) {
        best = Math.max(best, 100);
      } else if (prefixLength >= 4) {
        best = Math.max(best, 90);
      } else if (prefixLength >= 2) {
        best = Math.max(best, 70);
      }
    }
  }
  return best;
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) {
    index += 1;
  }
  return index;
}

function categoryScore(
  profile: CompanyMatchProfile,
  deal: MatchableDeal,
  reasons: MatchReason[],
): number | null {
  const preferred = uniqueNormalized(profile.preferredCategorySlugs);
  const cpv = cpvOverlap(profile.preferredCpvCodes, deal.cpvCodes ?? []);
  if (preferred.length === 0 && cpv == null) {
    return null;
  }

  const dealCategory = resolveCategory(deal.mainCategory);
  let category = 18;
  if (dealCategory) {
    const matched = preferred.some((item) => {
      const resolved = resolveCategory(item);
      return (
        resolved?.slug === dealCategory.slug ||
        normalizeMatchText(resolved?.name ?? item) ===
          normalizeMatchText(dealCategory.name)
      );
    });
    if (matched) {
      category = 100;
      reasons.push({
        code: "CATEGORY_OVERLAP",
        kind: "match",
        surface: "preview",
      });
    } else if (preferred.length > 0) {
      category = 18;
    }
  }

  if (cpv != null && cpv >= 70) {
    reasons.push({
      code: "CPV_OVERLAP",
      kind: "match",
      surface: "preview",
    });
  }

  if (cpv == null) {
    return category;
  }
  if (preferred.length === 0) {
    return cpv;
  }
  return Math.round(category * 0.6 + cpv * 0.4);
}

function keywordScore(
  profile: CompanyMatchProfile,
  deal: MatchableDeal,
  reasons: MatchReason[],
): { score: number | null; negativeHit: boolean } {
  const positives = uniqueNormalized([
    ...profile.keywords,
    ...profile.productsServices,
  ]);
  const negatives = uniqueNormalized(profile.negativeKeywords);
  const haystack = scoringHaystack(deal);
  const preview = previewHaystack(deal);

  let negativeHit = false;
  for (const needle of negatives) {
    if (haystackContainsPhrase(haystack, needle) || haystackContainsPhrase(preview, needle)) {
      negativeHit = true;
      reasons.push({
        code: "NEGATIVE_KEYWORD",
        kind: "mismatch",
        surface: "preview",
      });
      break;
    }
  }

  if (positives.length === 0) {
    return { score: negativeHit ? 0 : null, negativeHit };
  }

  let hits = 0;
  for (const needle of positives) {
    if (haystackContainsPhrase(preview, needle) || haystackContainsPhrase(haystack, needle)) {
      hits += 1;
    }
  }

  if (hits > 0) {
    reasons.push({
      code: "KEYWORD_OVERLAP",
      kind: "match",
      surface: "preview",
    });
  }

  const ratio = hits / positives.length;
  const score = negativeHit ? 0 : Math.round(Math.min(100, 45 + ratio * 55));
  return { score: hits === 0 && !negativeHit ? 22 : score, negativeHit };
}

function normalizeRegion(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const lowered = trimmed.toLowerCase();
  for (const region of BROAD_REGIONS) {
    if (region.toLowerCase() === lowered) {
      return region;
    }
  }
  for (const region of BROAD_REGIONS) {
    if (lowered.includes(region.toLowerCase()) || region.toLowerCase().includes(lowered)) {
      if (lowered === "england") {
        return null;
      }
      return region;
    }
  }
  return trimmed;
}

function locationScore(
  profile: CompanyMatchProfile,
  deal: MatchableDeal,
  reasons: MatchReason[],
): number | null {
  const preferred = uniqueNormalized(profile.preferredRegions)
    .map(normalizeRegion)
    .filter((item): item is string => Boolean(item));
  if (preferred.length === 0) {
    return null;
  }

  const dealRegion = normalizeRegion(deal.broadRegion ?? "") ?? deal.broadRegion;
  if (!dealRegion) {
    return 50;
  }

  const prefersNationwide = preferred.some(
    (item) => item === "Nationwide" || item.toLowerCase() === "uk",
  );
  if (prefersNationwide || dealRegion === "Nationwide") {
    reasons.push({ code: "REGION_MATCH", kind: "match", surface: "preview" });
    return 100;
  }

  if (preferred.includes(dealRegion)) {
    reasons.push({ code: "REGION_MATCH", kind: "match", surface: "preview" });
    return 100;
  }

  if (dealRegion === "Remote") {
    reasons.push({ code: "REGION_MATCH", kind: "match", surface: "preview" });
    return 70;
  }

  if (preferred.includes("Remote") && dealRegion !== "Remote") {
    return 55;
  }

  reasons.push({ code: "REGION_MISMATCH", kind: "mismatch", surface: "preview" });
  return 12;
}

function rangeFromBand(valueBand: string | null): { min: number | null; max: number | null } {
  if (!valueBand) {
    return { min: null, max: null };
  }
  if ((VALUE_BANDS as readonly string[]).includes(valueBand)) {
    return VALUE_BAND_RANGES[valueBand as ValueBand];
  }
  return { min: null, max: null };
}

function rangesOverlap(
  aMin: number | null,
  aMax: number | null,
  bMin: number | null,
  bMax: number | null,
): boolean {
  const left = aMin ?? 0;
  const right = aMax ?? Number.POSITIVE_INFINITY;
  const otherLeft = bMin ?? 0;
  const otherRight = bMax ?? Number.POSITIVE_INFINITY;
  return left <= otherRight && otherLeft <= right;
}

function valueScore(
  profile: CompanyMatchProfile,
  deal: MatchableDeal,
  reasons: MatchReason[],
): number | null {
  if (profile.minimumDealValue == null && profile.maximumDealValue == null) {
    return null;
  }

  const band = rangeFromBand(deal.valueBand);
  const dealMin = deal.valueMinExVat ?? band.min;
  const dealMax = deal.valueMaxExVat ?? band.max;
  if (dealMin == null && dealMax == null) {
    return 50;
  }

  const inRange = rangesOverlap(
    profile.minimumDealValue,
    profile.maximumDealValue,
    dealMin,
    dealMax,
  );
  if (inRange) {
    reasons.push({ code: "VALUE_IN_RANGE", kind: "match", surface: "preview" });
    return 100;
  }

  reasons.push({ code: "VALUE_OUT_OF_RANGE", kind: "mismatch", surface: "preview" });
  return 10;
}

function sectorScore(
  profile: CompanyMatchProfile,
  deal: MatchableDeal,
  reasons: MatchReason[],
): number | null {
  if (profile.preferredBuyerSectors.length === 0) {
    return null;
  }
  if (profile.preferredBuyerSectors.includes(deal.buyerSector)) {
    reasons.push({ code: "SECTOR_MATCH", kind: "match", surface: "preview" });
    return 100;
  }
  reasons.push({ code: "SECTOR_MISMATCH", kind: "mismatch", surface: "preview" });
  return 15;
}

function certificationScore(
  profile: CompanyMatchProfile,
  deal: MatchableDeal,
  reasons: MatchReason[],
): number | null {
  const certs = uniqueNormalized(profile.certifications);
  const memberships = uniqueNormalized(profile.frameworkMemberships);
  if (certs.length === 0 && memberships.length === 0) {
    return null;
  }

  const preview = previewHaystack(deal);
  const protectedText = protectedHaystack(deal);
  const combined = `${preview} ${protectedText}`;
  let certHits = 0;
  for (const cert of certs) {
    if (haystackContainsPhrase(combined, cert)) {
      certHits += 1;
    }
  }

  const frameworkDeal =
    deal.dealType === "FRAMEWORK" || deal.dealType === "DYNAMIC_MARKET";
  let membershipHits = 0;
  for (const membership of memberships) {
    if (haystackContainsPhrase(combined, membership)) {
      membershipHits += 1;
    }
  }

  if (certHits > 0) {
    reasons.push({
      code: "CERTIFICATION_SIGNAL",
      kind: "match",
      surface: "preview",
    });
  } else if (certs.length > 0) {
    const mandatoryCompliance = (deal.mandatoryRequirementTypes ?? []).some((type) =>
      ["COMPLIANCE", "SECURITY", "INSURANCE"].includes(type),
    );
    if (mandatoryCompliance || (deal.requirementNames ?? []).length > 0) {
      reasons.push({
        code: "CERTIFICATION_GAP",
        kind: "mismatch",
        surface: "detail",
      });
    }
  }

  if (membershipHits > 0) {
    reasons.push({
      code: "FRAMEWORK_SIGNAL",
      kind: "match",
      surface: "preview",
    });
  } else if (frameworkDeal && memberships.length > 0) {
    reasons.push({
      code: "FRAMEWORK_GAP",
      kind: "mismatch",
      surface: "detail",
    });
  }

  if (certHits === 0 && membershipHits === 0 && !frameworkDeal) {
    return 25;
  }
  if (frameworkDeal && membershipHits === 0 && certHits === 0) {
    return 40;
  }
  return Math.min(100, 60 + certHits * 15 + membershipHits * 15);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function weightedAverage(
  components: MatchComponentScores,
  includeSemantic: boolean,
): number {
  const weights: Record<keyof MatchComponentScores, number | undefined> = includeSemantic
    ? WEIGHTS_WITH_SEMANTIC
    : { ...WEIGHTS_WITHOUT_SEMANTIC, semantic: undefined };
  let totalWeight = 0;
  let total = 0;
  (Object.keys(components) as Array<keyof MatchComponentScores>).forEach((key) => {
    const score = components[key];
    const weight = weights[key];
    if (score == null || weight == null) {
      return;
    }
    total += score * weight;
    totalWeight += weight;
  });
  if (totalWeight === 0) {
    return 50;
  }
  return total / totalWeight;
}

export function scoreDealMatch(
  profile: CompanyMatchProfile,
  deal: MatchableDeal,
  options?: { semanticScore?: number | null },
): DealMatchScore {
  const reasons: MatchReason[] = [];
  const hasProfile = profileHasPreferences(profile);
  if (!hasProfile) {
    reasons.push({
      code: "PROFILE_LIMITED",
      kind: "mismatch",
      surface: "preview",
    });
  }

  const category = categoryScore(profile, deal, reasons);
  const keyword = keywordScore(profile, deal, reasons);
  const location = locationScore(profile, deal, reasons);
  const value = valueScore(profile, deal, reasons);
  const sector = sectorScore(profile, deal, reasons);
  const certification = certificationScore(profile, deal, reasons);
  const semantic =
    options?.semanticScore == null
      ? null
      : clampScore(options.semanticScore);

  if (semantic != null && semantic >= 55) {
    reasons.push({
      code: "SEMANTIC_SIMILARITY",
      kind: "match",
      surface: "preview",
    });
  }

  const components: MatchComponentScores = {
    category,
    keyword: keyword.score,
    location,
    value,
    sector,
    certification,
    semantic,
  };

  let relevance = weightedAverage(components, semantic != null);
  if (keyword.negativeHit) {
    relevance -= NEGATIVE_KEYWORD_PENALTY;
  }
  if (!hasProfile) {
    relevance = Math.min(relevance, 50);
  }

  const uniqueReasons: MatchReason[] = [];
  const seen = new Set<string>();
  for (const reason of reasons) {
    const key = `${reason.code}:${reason.surface}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueReasons.push(reason);
  }

  return {
    relevanceScore: clampScore(relevance),
    components,
    reasons: uniqueReasons,
  };
}

export function profileEmbeddingText(profile: CompanyMatchProfile): string {
  return [
    profile.companyDescription ?? "",
    ...profile.productsServices,
    ...profile.keywords,
    ...profile.preferredCategorySlugs,
    ...profile.certifications,
    ...profile.frameworkMemberships,
  ]
    .filter(Boolean)
    .join(". ");
}

export function dealEmbeddingText(deal: MatchableDeal): string {
  return [
    deal.previewTitle,
    deal.previewSummary,
    deal.mainCategory ?? "",
    ...deal.relevanceTags,
    ...deal.requirementsPreview,
  ]
    .filter(Boolean)
    .join(". ");
}
