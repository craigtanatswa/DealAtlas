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
  crawlDiscoverySource,
  crawlerCompliance,
  detectBlockedPage,
  extractLinks,
  extractRssItems,
} from "@/ingestion/discovery/crawler";
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
  buildDiscoverySearchQueries,
  createSearchProviderFromEnv,
  createTavilySearchProvider,
  DEFAULT_SEARCH_MAX_QUERIES_PER_RUN,
  runSearchDiscovery,
  searchMaxQueriesFromEnv,
  SearchProviderError,
  TAVILY_SEARCH_ENDPOINT,
} from "@/ingestion/discovery/search";
export {
  loadDiscoverySeeds,
  SEARCH_DISCOVERY_SOURCE_KEY,
  seededSourceKeys,
  seedSourceInsertRows,
  searchSourceInsertRow,
  UK_DISCOVERY_SEEDS,
} from "@/ingestion/discovery/seeds";
export {
  createMemoryDiscoveryStore,
  createSupabaseDiscoveryStore,
} from "@/ingestion/discovery/store";
export type {
  CandidateStatus,
  DiscoveryAdapter,
  DiscoveryChannel,
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
