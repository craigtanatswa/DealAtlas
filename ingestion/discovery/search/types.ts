export type SearchResult = {
  title: string;
  url: string;
  content: string;
  score: number | null;
  publishedAt: string | null;
};

export type SearchProvider = {
  readonly id: string;
  search(query: string, options?: { maxResults?: number }): Promise<SearchResult[]>;
};

export type DiscoverySearchQuery = {
  query: string;
  keyword: string;
  seedKey: string | null;
  seedDomain: string | null;
};

export type DiscoverySearchResult = {
  skipped: boolean;
  reason: string | null;
  queriesUsed: number;
  results: number;
  candidates: number;
  duplicates: number;
  errors: number;
};
