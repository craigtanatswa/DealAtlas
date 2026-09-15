export {
  extractDealIntelligence,
  inferBidComplexity,
  inferCompetitionLevel,
  inferSmeSuitability,
} from "@/ingestion/intelligence/extract";
export {
  createLanguageModelProvider,
  createRulesLanguageModel,
  type LanguageModelProvider,
} from "@/ingestion/intelligence/provider";
export {
  contextFromCandidate,
  contextFromPersisted,
  RULES_MODEL,
  type DealIntelligence,
  type IntelligenceContext,
} from "@/ingestion/intelligence/types";
