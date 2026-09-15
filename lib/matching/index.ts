export {
  DEAL_CATEGORY_CATALOG,
  DEAL_CATEGORY_SLUGS,
  resolveCategory,
  slugifyCategory,
} from "@/lib/matching/categories";
export {
  createEmbeddingProvider,
  cosineSimilarity,
  embeddingConfigFromEnv,
  similarityToScore,
} from "@/lib/matching/embeddings";
export {
  parseStoredReasons,
  reasonsToJson,
  sanitisedDetailReasons,
  sanitisedPreviewReasons,
} from "@/lib/matching/reasons";
export {
  dealEmbeddingText,
  haystackContainsPhrase,
  profileEmbeddingText,
  scoreDealMatch,
} from "@/lib/matching/score";
export { dropLeakingReasons } from "@/lib/matching/sanitize";
export type {
  CompanyMatchProfile,
  DealMatchScore,
  MatchableDeal,
  ProMatchView,
  SafeMatchView,
  SanitisedMatchReason,
} from "@/lib/matching/types";
