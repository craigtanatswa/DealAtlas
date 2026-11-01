import type { Database } from "@/lib/db/database.types";
import type { DealType } from "@/lib/search/filters";

export type DiscoveryMethod = Database["public"]["Enums"]["discovery_method"];
export type CandidateStatus = Database["public"]["Enums"]["candidate_status"];
export type MarketSector = Database["public"]["Enums"]["market_sector"];

export type DiscoveryKeyword = {
  id: string;
  keyword: string;
  normalizedKeyword: string;
  enabled: boolean;
};

export type DiscoverySourceConfig = {
  id: string;
  sourceKey: string;
  name: string;
  baseUrl: string | null;
  apiUrl: string | null;
  accessMethod: Database["public"]["Enums"]["access_method"];
  reuseStatus: Database["public"]["Enums"]["reuse_status"];
  scrapingPermitted: boolean;
  discoveryMethod: DiscoveryMethod | null;
  parserType: string | null;
  parserConfig: Record<string, unknown>;
  rateLimitPerMinute: number | null;
  autoPublish: boolean;
  autoPublishMinConfidence: number;
};

export type DiscoveryListItem = {
  url: string;
  title?: string | null;
  summary?: string | null;
  publishedAt?: string | null;
  payload?: unknown;
};

export type DiscoveryPage = {
  url: string;
  title: string;
  text: string;
  html?: string | null;
  publishedAt?: string | null;
};

export type DiscoveryListPage = {
  items: DiscoveryListItem[];
  nextCursor?: string;
  truncated?: boolean;
};

export type DiscoveryAdapter = {
  sourceKey: string;
  method: DiscoveryMethod;
  discover(cursor?: string, limit?: number): Promise<DiscoveryListPage>;
  fetch(item: DiscoveryListItem): Promise<DiscoveryPage>;
};

export type OpportunityExtraction = {
  isOpportunity: boolean;
  opportunityType: DealType | null;
  title: string | null;
  buyerName: string | null;
  buyerDomain: string | null;
  summary: string | null;
  deadline: string | null;
  budgetText: string | null;
  sector: string | null;
  location: string | null;
  requirements: string[];
  rejectionReason: string | null;
  confidence: number;
};

export type DiscoveryPrefilter = {
  classify: boolean;
  onboarding: boolean;
  matchedKeywords: string[];
  disqualifiers: string[];
  reason: string | null;
};

export type OpportunityCandidateDraft = OpportunityExtraction & {
  url: string;
  normalizedUrl: string;
  contentHash: string;
  dedupeKey: string;
  keywords: string[];
  status: CandidateStatus;
  rejectReason: string | null;
  rawPayload?: unknown;
};

export type StoredOpportunityCandidate = {
  id: string;
  sourceId: string;
  url: string;
  normalizedUrl: string;
  dedupeKey: string;
  status: CandidateStatus;
  confidence: number;
  opportunityType: DealType | null;
  mergedDealId: string | null;
};

export type DiscoveryStore = {
  upsertDiscoveredCandidate(input: {
    sourceId: string;
    url: string;
    normalizedUrl: string;
    domain: string | null;
    title: string | null;
    publishedAt: string | null;
    status: CandidateStatus;
    confidence: number;
    matchedKeywords: string[];
    contentHash: string;
    rawPayload: unknown;
  }): Promise<{ id: string }>;
  findByDedupe(
    sourceId: string,
    dedupeKey: string,
  ): Promise<StoredOpportunityCandidate | null>;
  insertOpportunityCandidate(input: {
    sourceId: string;
    discoveredCandidateId: string;
    url: string;
    normalizedUrl: string;
    contentHash: string;
    extraction: OpportunityExtraction;
    dedupeKey: string;
    status: CandidateStatus;
    rejectReason: string | null;
    isPrivate: boolean;
  }): Promise<StoredOpportunityCandidate>;
  updateMergedDeal(candidateId: string, dealId: string): Promise<void>;
  recordSourceRun(input: {
    sourceId: string;
    discovered: number;
    opportunities: number;
    rejected: number;
    duplicates: number;
    errors: number;
    lastError: string | null;
  }): Promise<void>;
};

export type DiscoveryRunResult = {
  sourceKey: string;
  discovered: number;
  candidates: number;
  rejected: number;
  duplicates: number;
  errors: number;
  reason?: string;
  candidatesStored: StoredOpportunityCandidate[];
};
