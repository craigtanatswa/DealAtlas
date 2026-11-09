import { contentHash } from "@/ingestion/core/hash";
import { canonicalFromExtraction, candidateStatusForExtraction } from "@/ingestion/discovery/candidate";
import { classifyOpportunity } from "@/ingestion/discovery/classify";
import {
  dedupeKeyForCandidate,
  domainFromCandidateUrl,
  normalizeCandidateUrl,
} from "@/ingestion/discovery/dedupe";
import {
  keywordVocabulary,
  prefilterOpportunity,
} from "@/ingestion/discovery/keywords";
import type {
  DiscoveryAdapter,
  DiscoveryKeyword,
  DiscoveryRunResult,
  DiscoveryStore,
  OpportunityCandidateDraft,
} from "@/ingestion/discovery/types";
import type { CanonicalCandidate } from "@/ingestion/core/types";
import {
  createRulesLanguageModel,
  type LanguageModelProvider,
} from "@/ingestion/intelligence/provider";
import type { DataSourceRecord } from "@/ingestion/store/types";

export type RunDiscoveryOptions = {
  source: DataSourceRecord;
  adapter: DiscoveryAdapter;
  store: DiscoveryStore;
  provider?: LanguageModelProvider;
  keywords: Array<Pick<DiscoveryKeyword, "keyword" | "enabled">>;
  limit?: number;
  now?: Date;
  persistDeal?: (
    draft: OpportunityCandidateDraft,
    candidate: CanonicalCandidate,
  ) => Promise<string | null>;
};

export async function runDiscoverySource(
  options: RunDiscoveryOptions,
): Promise<DiscoveryRunResult> {
  const now = options.now ?? new Date();
  const provider = options.provider ?? createRulesLanguageModel();
  const keywords = keywordVocabulary(options.keywords);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const result: DiscoveryRunResult = {
    sourceKey: options.source.sourceKey,
    discovered: 0,
    candidates: 0,
    rejected: 0,
    duplicates: 0,
    errors: 0,
    candidatesStored: [],
  };

  try {
    const listing = await options.adapter.discover(undefined, limit);
    const seen = new Set<string>();
    for (const item of listing.items.slice(0, limit)) {
      const normalizedUrl =
        normalizeCandidateUrl(
          item.url,
          options.source.apiUrl ?? options.source.baseUrl ?? undefined,
        ) ?? null;
      if (!normalizedUrl || seen.has(normalizedUrl)) {
        continue;
      }
      seen.add(normalizedUrl);
      result.discovered += 1;

      try {
        const page = await options.adapter.fetch(item);
        const title = page.title || item.title || "";
        const text = page.text;
        const hash = contentHash({ title, text, url: normalizedUrl });
        const prefilter = prefilterOpportunity({ title, text, keywords });

        if (!prefilter.classify) {
          await options.store.upsertDiscoveredCandidate({
            sourceId: options.source.id,
            url: page.url,
            normalizedUrl,
            domain: domainFromCandidateUrl(normalizedUrl),
            title: title || null,
            publishedAt: page.publishedAt ?? item.publishedAt ?? null,
            status: "REJECTED",
            confidence: 0,
            matchedKeywords: prefilter.matchedKeywords,
            contentHash: hash,
            rawPayload: {
              title,
              text: text.slice(0, 12_000),
              reason: prefilter.reason,
              disqualifiers: prefilter.disqualifiers,
            },
          });
          result.rejected += 1;
          continue;
        }

        const classified = await classifyOpportunity({
          page: { ...page, title },
          provider,
          keywords,
          matchedKeywords: prefilter.matchedKeywords,
        });
        const extraction = classified.extraction;
        const status = candidateStatusForExtraction({
          extraction,
          onboarding: prefilter.onboarding,
          now,
        });

        const discovered = await options.store.upsertDiscoveredCandidate({
          sourceId: options.source.id,
          url: page.url,
          normalizedUrl,
          domain: domainFromCandidateUrl(normalizedUrl),
          title: extraction.title ?? title ?? null,
          publishedAt: page.publishedAt ?? item.publishedAt ?? null,
          status: status.status,
          confidence: extraction.confidence,
          matchedKeywords: prefilter.matchedKeywords,
          contentHash: hash,
          rawPayload: {
            title,
            text: text.slice(0, 12_000),
            extraction,
            classificationMethod: classified.method,
            modelVersion: classified.modelVersion,
          },
        });

        const dedupeKey = dedupeKeyForCandidate({
          buyerName: extraction.buyerName,
          title: extraction.title,
          deadline: extraction.deadline,
          normalizedUrl,
        });
        const existing = await options.store.findByDedupe(options.source.id, dedupeKey);
        if (existing && existing.status !== "REJECTED" && status.status !== "REJECTED") {
          await options.store.upsertDiscoveredCandidate({
            sourceId: options.source.id,
            url: page.url,
            normalizedUrl,
            domain: domainFromCandidateUrl(normalizedUrl),
            title: extraction.title ?? title ?? null,
            publishedAt: page.publishedAt ?? item.publishedAt ?? null,
            status: "DUPLICATE",
            confidence: extraction.confidence,
            matchedKeywords: prefilter.matchedKeywords,
            contentHash: hash,
            rawPayload: {
              duplicateOf: existing.id,
              extraction,
            },
          });
          result.duplicates += 1;
          continue;
        }

        const draft: OpportunityCandidateDraft = {
          ...extraction,
          url: page.url,
          normalizedUrl,
          contentHash: hash,
          dedupeKey,
          keywords: prefilter.matchedKeywords,
          status: status.status,
          rejectReason: status.reason,
          rawPayload: { title, text: text.slice(0, 12_000) },
        };
        const stored = await options.store.insertOpportunityCandidate({
          sourceId: options.source.id,
          discoveredCandidateId: discovered.id,
          url: page.url,
          normalizedUrl,
          contentHash: hash,
          extraction,
          dedupeKey,
          status: status.status,
          rejectReason: status.reason,
          isPrivate: true,
        });
        result.candidates += 1;
        result.candidatesStored.push(stored);

        if (
          stored.status === "PENDING_REVIEW" &&
          options.persistDeal &&
          extraction.isOpportunity
        ) {
          const dealId = await options.persistDeal(
            draft,
            canonicalFromExtraction({
              sourceKey: options.source.sourceKey,
              url: normalizedUrl,
              extraction,
              now,
            }),
          );
          if (dealId) {
            await options.store.updateMergedDeal(stored.id, dealId);
            stored.mergedDealId = dealId;
          }
        }
      } catch (error) {
        result.errors += 1;
        await options.store.upsertDiscoveredCandidate({
          sourceId: options.source.id,
          url: item.url,
          normalizedUrl,
          domain: domainFromCandidateUrl(normalizedUrl),
          title: item.title ?? null,
          publishedAt: item.publishedAt ?? null,
          status: "REJECTED",
          confidence: 0,
          matchedKeywords: [],
          contentHash: contentHash({ url: normalizedUrl, error: errorMessage(error) }),
          rawPayload: { error: errorMessage(error) },
        });
      }
    }
  } catch (error) {
    result.errors += 1;
    result.reason = errorMessage(error);
  } finally {
    await options.store.recordSourceRun({
      sourceId: options.source.id,
      discovered: result.discovered,
      opportunities: result.candidates,
      rejected: result.rejected,
      duplicates: result.duplicates,
      errors: result.errors,
      lastError: result.reason ?? null,
    });
  }

  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown discovery error";
}
