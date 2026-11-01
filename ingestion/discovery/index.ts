export {
  assertDiscoverySourceAllowed,
  createDiscoverySourceAdapter,
} from "@/ingestion/discovery/adapter";
export {
  canonicalFromExtraction,
  candidateStatusForExtraction,
} from "@/ingestion/discovery/candidate";
export {
  classifyOpportunity,
  normalizeDeadline,
  normalizeOpportunityType,
  rulesExtraction,
} from "@/ingestion/discovery/classify";
export {
  candidatesLookLikeDuplicates,
  dedupeKeyForCandidate,
  domainFromCandidateUrl,
  normalizeCandidateUrl,
} from "@/ingestion/discovery/dedupe";
export {
  DEFAULT_DISCOVERY_KEYWORDS,
  findKeywordMatches,
  keywordVocabulary,
  normalizeKeyword,
  prefilterOpportunity,
} from "@/ingestion/discovery/keywords";
export { runDiscoverySource } from "@/ingestion/discovery/run";
export {
  createMemoryDiscoveryStore,
  createSupabaseDiscoveryStore,
} from "@/ingestion/discovery/store";
export type {
  CandidateStatus,
  DiscoveryAdapter,
  DiscoveryKeyword,
  DiscoveryListItem,
  DiscoveryListPage,
  DiscoveryMethod,
  DiscoveryPage,
  DiscoveryRunResult,
  DiscoverySourceConfig,
  DiscoveryStore,
  MarketSector,
  OpportunityCandidateDraft,
  OpportunityExtraction,
  StoredOpportunityCandidate,
} from "@/ingestion/discovery/types";
