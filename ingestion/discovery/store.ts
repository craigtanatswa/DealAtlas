import type { Database } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import type {
  CandidateStatus,
  DiscoveryStore,
  StoredOpportunityCandidate,
} from "@/ingestion/discovery/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;

export function createSupabaseDiscoveryStore(client: Client): DiscoveryStore {
  return {
    async upsertDiscoveredCandidate(input) {
      const { data, error } = await client
        .from("discovered_source_candidates")
        .upsert(
          {
            source_id: input.sourceId,
            url: input.url,
            normalized_url: input.normalizedUrl,
            domain: input.domain,
            title: input.title,
            published_at: input.publishedAt,
            status: input.status,
            confidence: input.confidence,
            matched_keywords: input.matchedKeywords,
            content_hash: input.contentHash,
            raw_payload: input.rawPayload as Database["public"]["Tables"]["discovered_source_candidates"]["Insert"]["raw_payload"],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "source_id,normalized_url" },
        )
        .select("id")
        .single();
      const row = throwIfQueryError("Save discovered source candidate", { data, error });
      if (!row) {
        throw new Error("Save discovered source candidate returned no row.");
      }
      return { id: row.id };
    },

    async findByDedupe(sourceId, dedupeKey) {
      const { data, error } = await client
        .from("opportunity_candidates")
        .select(
          "id, source_id, url, dedupe_key, status, confidence, opportunity_type, merged_deal_id",
        )
        .eq("source_id", sourceId)
        .eq("dedupe_key", dedupeKey)
        .maybeSingle();
      const row = throwIfQueryError("Find opportunity candidate", { data, error });
      return row ? mapCandidate(row) : null;
    },

    async insertOpportunityCandidate(input) {
      const { data, error } = await client
        .from("opportunity_candidates")
        .upsert(
          {
            source_id: input.sourceId,
            discovered_candidate_id: input.discoveredCandidateId,
            url: input.normalizedUrl,
            content_hash: input.contentHash,
            extraction: input.extraction as Database["public"]["Tables"]["opportunity_candidates"]["Insert"]["extraction"],
            title: input.extraction.title,
            buyer_name: input.extraction.buyerName,
            buyer_domain: input.extraction.buyerDomain,
            summary: input.extraction.summary,
            deadline: input.extraction.deadline,
            confidence: input.extraction.confidence,
            opportunity_type: input.extraction.opportunityType,
            is_private: input.isPrivate,
            status: input.status,
            reject_reason: input.rejectReason,
            dedupe_key: input.dedupeKey,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "source_id,dedupe_key" },
        )
        .select(
          "id, source_id, url, dedupe_key, status, confidence, opportunity_type, merged_deal_id",
        )
        .single();
      const row = throwIfQueryError("Save opportunity candidate", { data, error });
      if (!row) {
        throw new Error("Save opportunity candidate returned no row.");
      }
      return mapCandidate(row);
    },

    async updateMergedDeal(candidateId, dealId) {
      const { error } = await client
        .from("opportunity_candidates")
        .update({ merged_deal_id: dealId, updated_at: new Date().toISOString() })
        .eq("id", candidateId);
      throwIfQueryError("Link opportunity candidate to deal", { data: true, error });
    },

    async recordSourceRun(input) {
      const { data: source, error: loadError } = await client
        .from("data_sources")
        .select("opportunities_discovered, consecutive_failures")
        .eq("id", input.sourceId)
        .maybeSingle();
      const current = throwIfQueryError("Load discovery source counters", {
        data: source,
        error: loadError,
      });
      const failures = input.errors > 0 ? (current?.consecutive_failures ?? 0) + 1 : 0;
      const { error } = await client
        .from("data_sources")
        .update({
          opportunities_discovered:
            (current?.opportunities_discovered ?? 0) + input.opportunities,
          consecutive_failures: failures,
          last_success_at:
            input.errors === 0 ? new Date().toISOString() : undefined,
          reliability_score: Math.max(0, Math.min(100, 100 - failures * 10)),
          last_error: input.lastError,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.sourceId);
      throwIfQueryError("Record discovery source run", { data: true, error });
    },
  };
}

function mapCandidate(row: {
  id: string;
  source_id: string;
  url: string;
  dedupe_key: string;
  status: CandidateStatus;
  confidence: number;
  opportunity_type: Database["public"]["Enums"]["deal_type"] | null;
  merged_deal_id: string | null;
}): StoredOpportunityCandidate {
  return {
    id: row.id,
    sourceId: row.source_id,
    url: row.url,
    normalizedUrl: row.url,
    dedupeKey: row.dedupe_key,
    status: row.status,
    confidence: row.confidence,
    opportunityType: row.opportunity_type,
    mergedDealId: row.merged_deal_id,
  };
}

export function createMemoryDiscoveryStore(): DiscoveryStore & {
  candidates: StoredOpportunityCandidate[];
  discovered: Array<{ id: string; normalizedUrl: string; status: CandidateStatus }>;
  lastRun: Record<string, unknown> | null;
} {
  const candidates: StoredOpportunityCandidate[] = [];
  const discovered: Array<{ id: string; normalizedUrl: string; status: CandidateStatus }> = [];
  let nextId = 1;
  let lastRun: Record<string, unknown> | null = null;

  return {
    candidates,
    discovered,
    get lastRun() {
      return lastRun;
    },
    async upsertDiscoveredCandidate(input) {
      const existing = discovered.find((item) => item.normalizedUrl === input.normalizedUrl);
      if (existing) {
        existing.status = input.status;
        return { id: existing.id };
      }
      const row = {
        id: `discovered-${nextId++}`,
        normalizedUrl: input.normalizedUrl,
        status: input.status,
      };
      discovered.push(row);
      return { id: row.id };
    },
    async findByDedupe(_sourceId, dedupeKey) {
      return candidates.find((item) => item.dedupeKey === dedupeKey) ?? null;
    },
    async insertOpportunityCandidate(input) {
      const existing = candidates.find((item) => item.dedupeKey === input.dedupeKey);
      if (existing) {
        existing.status = input.status;
        return existing;
      }
      const row: StoredOpportunityCandidate = {
        id: `candidate-${nextId++}`,
        sourceId: input.sourceId,
        url: input.url,
        normalizedUrl: input.normalizedUrl,
        dedupeKey: input.dedupeKey,
        status: input.status,
        confidence: input.extraction.confidence,
        opportunityType: input.extraction.opportunityType,
        mergedDealId: null,
      };
      candidates.push(row);
      return row;
    },
    async updateMergedDeal(candidateId, dealId) {
      const candidate = candidates.find((item) => item.id === candidateId);
      if (candidate) {
        candidate.mergedDealId = dealId;
      }
    },
    async recordSourceRun(input) {
      lastRun = input;
    },
  };
}
