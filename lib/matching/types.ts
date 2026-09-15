import type { BuyerSector } from "@/lib/constants";
import type { DealType } from "@/lib/search/filters";

export const MATCH_REASON_CODES = [
  "CATEGORY_OVERLAP",
  "CPV_OVERLAP",
  "KEYWORD_OVERLAP",
  "NEGATIVE_KEYWORD",
  "REGION_MATCH",
  "REGION_MISMATCH",
  "VALUE_IN_RANGE",
  "VALUE_OUT_OF_RANGE",
  "SECTOR_MATCH",
  "SECTOR_MISMATCH",
  "CERTIFICATION_SIGNAL",
  "CERTIFICATION_GAP",
  "FRAMEWORK_SIGNAL",
  "FRAMEWORK_GAP",
  "SEMANTIC_SIMILARITY",
  "PROFILE_LIMITED",
] as const;

export type MatchReasonCode = (typeof MATCH_REASON_CODES)[number];

export type MatchReasonKind = "match" | "mismatch";

export type MatchReasonSurface = "preview" | "detail";

export type MatchReason = {
  code: MatchReasonCode;
  kind: MatchReasonKind;
  surface: MatchReasonSurface;
};

export type SanitisedMatchReason = {
  code: MatchReasonCode;
  kind: MatchReasonKind;
  label: string;
};

export type CompanyMatchProfile = {
  companyDescription: string | null;
  productsServices: string[];
  preferredCategorySlugs: string[];
  preferredCpvCodes: string[];
  keywords: string[];
  negativeKeywords: string[];
  preferredRegions: string[];
  minimumDealValue: number | null;
  maximumDealValue: number | null;
  certifications: string[];
  frameworkMemberships: string[];
  preferredBuyerSectors: BuyerSector[];
};

export type MatchableDeal = {
  dealId: string;
  previewTitle: string;
  previewSummary: string;
  mainCategory: string | null;
  broadRegion: string | null;
  valueBand: string | null;
  buyerSector: BuyerSector;
  dealType: DealType;
  relevanceTags: string[];
  requirementsPreview: string[];
  cpvCodes?: string[];
  valueMinExVat?: number | null;
  valueMaxExVat?: number | null;
  requirementNames?: string[];
  requirementTypes?: string[];
  mandatoryRequirementTypes?: string[];
  commercialToolNames?: string[];
};

export type MatchComponentScores = {
  category: number | null;
  keyword: number | null;
  location: number | null;
  value: number | null;
  sector: number | null;
  certification: number | null;
  semantic: number | null;
};

export type DealMatchScore = {
  relevanceScore: number;
  components: MatchComponentScores;
  reasons: MatchReason[];
};

export type SafeMatchView = {
  score: number;
  reasons: SanitisedMatchReason[];
};

export type ProMatchView = SafeMatchView & {
  mismatches: SanitisedMatchReason[];
};

export const PREVIEW_REASON_LABELS: Record<MatchReasonCode, string> = {
  CATEGORY_OVERLAP: "Category overlap with your profile",
  CPV_OVERLAP: "Classification overlap with your profile",
  KEYWORD_OVERLAP: "Keyword overlap with the sanitised preview",
  NEGATIVE_KEYWORD: "Reduced by a negative keyword",
  REGION_MATCH: "Region overlap with areas you serve",
  REGION_MISMATCH: "Region is outside your stated coverage",
  VALUE_IN_RANGE: "Value band sits within your range",
  VALUE_OUT_OF_RANGE: "Value band sits outside your range",
  SECTOR_MATCH: "Buyer sector matches your preference",
  SECTOR_MISMATCH: "Buyer sector differs from your preference",
  CERTIFICATION_SIGNAL: "Certification signal in general requirements",
  CERTIFICATION_GAP: "A listed certification requirement may not match your profile",
  FRAMEWORK_SIGNAL: "Framework or dynamic-market related opportunity",
  FRAMEWORK_GAP: "Framework-related opportunity; membership not listed",
  SEMANTIC_SIMILARITY: "Semantic similarity to your company description",
  PROFILE_LIMITED: "Limited profile data; score is approximate",
};

export const DETAIL_REASON_LABELS: Partial<Record<MatchReasonCode, string>> = {
  CERTIFICATION_GAP:
    "A mandatory compliance or certification requirement may not match your listed certifications",
  FRAMEWORK_GAP:
    "This opportunity appears framework-related and your listed memberships did not overlap",
  VALUE_OUT_OF_RANGE:
    "Exact value (where available) sits outside the range on your company profile",
  REGION_MISMATCH:
    "Delivery location sits outside the regions on your company profile",
  SECTOR_MISMATCH:
    "Buyer sector is outside the sectors on your company profile",
  NEGATIVE_KEYWORD:
    "A negative keyword from your profile appears in the opportunity wording we use for matching",
};

export const MATCH_PREVIEW_COLUMNS = [
  "deal_id",
  "relevance_score",
  "preview_reasons",
  "category_score",
  "keyword_score",
  "location_score",
  "value_score",
  "sector_score",
  "certification_score",
  "semantic_score",
] as const;

export const MATCH_PREVIEW_SELECT =
  "deal_id, relevance_score, preview_reasons, category_score, keyword_score, location_score, value_score, sector_score, certification_score, semantic_score";

export const MATCH_DETAIL_SELECT =
  "deal_id, relevance_score, preview_reasons, category_score, keyword_score, location_score, value_score, sector_score, certification_score, semantic_score, detail_reasons";
