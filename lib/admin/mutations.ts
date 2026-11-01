import "server-only";

import { canIngestSource } from "@/ingestion/core/compliance";
import { persistCandidate } from "@/ingestion/core/persist";
import { runIngestion } from "@/ingestion/core/pipeline";
import {
  createDiscoverySourceAdapter,
  createSupabaseDiscoveryStore,
  runDiscoverySource,
} from "@/ingestion/discovery";
import { contextFromPersisted } from "@/ingestion/intelligence/types";
import { persistIntelligenceAndPreview } from "@/ingestion/preview/publish";
import { getSourceAdapter } from "@/ingestion/sources/registry";
import { createSupabaseIngestionStore } from "@/ingestion/store/supabase";
import type { DataSourceRecord, RawRecordRow } from "@/ingestion/store/types";
import { recordAdminAudit } from "@/lib/admin/audit";
import { AdminMutationError } from "@/lib/admin/errors";
import { canPublishPreview } from "@/lib/admin/preview-policy";
import { autoPublishMayPublish, candidateApprovedForPublish } from "@/lib/deals/publish-gate";
import { ADMIN_INGEST_LIMIT } from "@/lib/admin/paths";
import { sourceEnableBlockReason } from "@/lib/admin/source-enable";
import { throwIfQueryError } from "@/lib/db/errors";
import { enqueueDealMatches, enqueueProfileMatches, processMatchJobs } from "@/lib/matching/queue";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function admin() {
  return createSupabaseAdminClient();
}

function store() {
  return createSupabaseIngestionStore(admin());
}

async function loadSourceForEnable(sourceId: string) {
  const { data, error } = await admin()
    .from("data_sources")
    .select(
      "id, source_key, name, reuse_status, access_method, scraping_permitted, enabled, licence_name, licence_url, terms_url, discovery_method",
    )
    .eq("id", sourceId)
    .maybeSingle();
  const row = throwIfQueryError("Failed to load source for enablement", {
    data,
    error,
  });
  if (!row) {
    throw new AdminMutationError("NOT_FOUND", "That source does not exist.");
  }
  return row;
}

export async function setSourceEnabled(input: {
  actorId: string;
  sourceId: string;
  enabled: boolean;
}): Promise<void> {
  const source = await loadSourceForEnable(input.sourceId);
  if (input.enabled) {
    const blocked = sourceEnableBlockReason({
      sourceKey: source.source_key,
      reuseStatus: source.reuse_status,
      accessMethod: source.access_method,
      scrapingPermitted: source.scraping_permitted,
      discoveryMethod: source.discovery_method,
    });
    if (blocked) {
      throw new AdminMutationError("SOURCE_ENABLE_BLOCKED", blocked);
    }
  }

  const { error } = await admin()
    .from("data_sources")
    .update({ enabled: input.enabled, updated_at: new Date().toISOString() })
    .eq("id", input.sourceId);
  throwIfQueryError("Failed to update source enablement", { data: true, error });

  await recordAdminAudit({
    actorId: input.actorId,
    action: input.enabled ? "source.enable" : "source.disable",
    entityType: "data_source",
    entityId: input.sourceId,
    summary: `${input.enabled ? "Enabled" : "Disabled"} source ${source.source_key}`,
    metadata: { sourceKey: source.source_key },
  });
}

export async function holdPreviewUnpublished(input: {
  actorId: string;
  dealId: string;
}): Promise<void> {
  const { data, error } = await admin()
    .from("deal_previews")
    .update({
      unpublished_by_admin: true,
      is_published: false,
      updated_at: new Date().toISOString(),
    })
    .eq("deal_id", input.dealId)
    .select("deal_id")
    .maybeSingle();
  throwIfQueryError("Failed to hold preview unpublished", { data, error });
  if (!data) {
    throw new AdminMutationError("NOT_FOUND", "That preview does not exist.");
  }
  await recordAdminAudit({
    actorId: input.actorId,
    action: "preview.hold_unpublished",
    entityType: "deal_preview",
    entityId: input.dealId,
    summary: `Held preview unpublished for deal ${input.dealId}`,
  });
}

export async function releasePreviewHold(input: {
  actorId: string;
  dealId: string;
}): Promise<void> {
  const { data, error } = await admin().rpc("admin_release_preview_hold", {
    p_deal_id: input.dealId,
  });
  throwIfQueryError("Failed to release preview hold", { data, error });
  if (data !== true) {
    throw new AdminMutationError("NOT_FOUND", "That preview does not exist.");
  }
  await recordAdminAudit({
    actorId: input.actorId,
    action: "preview.release_hold",
    entityType: "deal_preview",
    entityId: input.dealId,
    summary: `Released unpublished hold for deal ${input.dealId}`,
  });
}

export async function publishPreviewIfLow(input: {
  actorId: string;
  dealId: string;
}): Promise<void> {
  const { data, error } = await admin()
    .from("deal_previews")
    .select("deal_id, leakage_risk, is_published, unpublished_by_admin")
    .eq("deal_id", input.dealId)
    .maybeSingle();
  const preview = throwIfQueryError("Failed to load preview for publish", {
    data,
    error,
  });
  if (!preview) {
    throw new AdminMutationError("NOT_FOUND", "That preview does not exist.");
  }
  const gate = canPublishPreview({
    leakageRisk: preview.leakage_risk,
    isPublished: preview.is_published,
    unpublishedByAdmin: preview.unpublished_by_admin,
  });
  if (!gate.allowed) {
    throw new AdminMutationError("PREVIEW_NOT_PUBLISHABLE", gate.reason ?? "Cannot publish.");
  }

  const { error: updateError } = await admin()
    .from("deal_previews")
    .update({ is_published: true, updated_at: new Date().toISOString() })
    .eq("deal_id", input.dealId);
  throwIfQueryError("Failed to publish preview", { data: true, error: updateError });

  await enqueueDealMatches(input.dealId);
  await recordAdminAudit({
    actorId: input.actorId,
    action: "preview.publish",
    entityType: "deal_preview",
    entityId: input.dealId,
    summary: `Published LOW-risk preview for deal ${input.dealId}`,
  });
}

export async function regenerateDealPreview(input: {
  actorId: string;
  dealId: string;
}): Promise<{ published: boolean; leakageRisk: string }> {
  const ingestion = store();
  const deal = await ingestion.getDealById(input.dealId);
  if (!deal) {
    throw new AdminMutationError("NOT_FOUND", "That deal does not exist.");
  }
  const context = await contextFromPersisted({
    store: ingestion,
    deal,
    now: new Date(),
  });
  if (!context) {
    throw new AdminMutationError(
      "PREVIEW_CONTEXT",
      "Cannot rebuild preview without a primary source on the deal.",
    );
  }
  const outcome = await persistIntelligenceAndPreview({ store: ingestion, context });
  if (outcome.published) {
    await enqueueDealMatches(input.dealId);
  }
  await recordAdminAudit({
    actorId: input.actorId,
    action: "preview.regenerate",
    entityType: "deal_preview",
    entityId: input.dealId,
    summary: `Regenerated preview for deal ${input.dealId} (${outcome.leakageRisk}, published=${outcome.published})`,
    metadata: { leakageRisk: outcome.leakageRisk, published: outcome.published },
  });
  return { published: outcome.published, leakageRisk: outcome.leakageRisk };
}

export async function updateDealQuality(input: {
  actorId: string;
  dealId: string;
  dataQualityScore: number;
}): Promise<void> {
  const { data, error } = await admin()
    .from("deals")
    .update({
      data_quality_score: input.dataQualityScore,
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.dealId)
    .select("id")
    .maybeSingle();
  throwIfQueryError("Failed to update deal quality", { data, error });
  if (!data) {
    throw new AdminMutationError("NOT_FOUND", "That deal does not exist.");
  }
  await recordAdminAudit({
    actorId: input.actorId,
    action: "deal.update_quality",
    entityType: "deal",
    entityId: input.dealId,
    summary: `Updated data quality score to ${input.dataQualityScore} for deal ${input.dealId}`,
    metadata: { dataQualityScore: input.dataQualityScore },
  });
}

export async function mergeOrganizations(input: {
  actorId: string;
  keepId: string;
  dropId: string;
}): Promise<void> {
  if (input.keepId === input.dropId) {
    throw new AdminMutationError("MERGE_SAME_ORG", "Choose two different organisations.");
  }
  const { error } = await admin().rpc("admin_merge_organizations", {
    p_keep: input.keepId,
    p_drop: input.dropId,
  });
  throwIfQueryError("Failed to merge organisations", { data: true, error });
  await recordAdminAudit({
    actorId: input.actorId,
    action: "organization.merge",
    entityType: "organization",
    entityId: input.keepId,
    summary: `Merged organisation ${input.dropId} into ${input.keepId}`,
    metadata: { keepId: input.keepId, dropId: input.dropId },
  });
}

async function runManualDiscoveryIngestion(input: {
  actorId: string;
  sourceId: string;
  source: DataSourceRecord;
}): Promise<{ status: string; runId: string | null; reason?: string }> {
  const ingestion = store();
  const discoveryStore = createSupabaseDiscoveryStore(admin());
  try {
    const source = input.source;
    const compliance = canIngestSource({
      sourceKey: source.sourceKey,
      enabled: source.enabled,
      reuseStatus: source.reuseStatus,
      accessMethod: source.accessMethod,
      scrapingPermitted: source.scrapingPermitted,
      licenceName: source.licenceName,
      licenceUrl: source.licenceUrl,
      termsUrl: source.termsUrl,
    });
    if (!compliance.allowed) {
      throw new AdminMutationError("SOURCE_INGEST_BLOCKED", compliance.reason);
    }
    const { data: keywordRows, error: keywordError } = await admin()
      .from("discovery_keywords")
      .select("keyword, enabled")
      .eq("enabled", true);
    const keywords = throwIfQueryError("Load discovery keywords", {
      data: keywordRows ?? [],
      error: keywordError,
    });
    const adapter = createDiscoverySourceAdapter({
      id: source.id,
      sourceKey: source.sourceKey,
      name: source.name,
      baseUrl: source.baseUrl,
      apiUrl: source.apiUrl,
      accessMethod: source.accessMethod,
      reuseStatus: source.reuseStatus,
      scrapingPermitted: source.scrapingPermitted,
      discoveryMethod: source.discoveryMethod ?? null,
      parserType: source.parserType ?? null,
      parserConfig: source.parserConfig ?? {},
      rateLimitPerMinute: source.rateLimitPerMinute,
      autoPublish: source.autoPublish ?? false,
      autoPublishMinConfidence: source.autoPublishMinConfidence ?? 90,
    });

    const result = await runDiscoverySource({
      source,
      adapter,
      store: discoveryStore,
      keywords,
      limit: ADMIN_INGEST_LIMIT,
      persistDeal: async (draft, candidate) => {
        const now = new Date();
        const raw = await ingestion.insertRawRecord({
          sourceId: source.id,
          ingestionRunId: null,
          externalRecordId: candidate.externalPrimaryId,
          sourceUrl: draft.normalizedUrl,
          publishedAt: now.toISOString(),
          fetchedAt: now.toISOString(),
          contentHash: draft.contentHash,
          contentType: "text/html",
          rawPayload: {
            discovery: draft.rawPayload ?? null,
            extraction: draft,
          },
          parserVersion: "discovery-v1.0.0",
        });
        const persisted = await persistCandidate({
          store: ingestion,
          source,
          raw: raw.record,
          candidate,
          now,
        });
        const context = await contextFromPersisted({
          store: ingestion,
          deal: persisted.deal,
          now,
        });
        if (context) {
          context.privateBuyerNames = draft.buyerName ? [draft.buyerName] : [];
          context.privateBuyerDomains = draft.buyerDomain ? [draft.buyerDomain] : [];
          context.privateSourceUrl = draft.normalizedUrl;
          await persistIntelligenceAndPreview({
            store: ingestion,
            context,
            publication: "preserve",
          });
        }
        return persisted.deal.id;
      },
    });

    for (const candidate of result.candidatesStored) {
      if (!candidate.mergedDealId) {
        continue;
      }
      const { error } = await admin()
        .from("deal_source_links")
        .upsert(
          {
            deal_id: candidate.mergedDealId,
            source_id: source.id,
            candidate_id: candidate.id,
            url: candidate.url,
            normalized_url: candidate.normalizedUrl,
            link_type: "DISCOVERED",
          },
          { onConflict: "source_id,normalized_url" },
        );
      throwIfQueryError("Link discovery candidate to deal", { data: true, error });
    }

    await recordAdminAudit({
      actorId: input.actorId,
      action: "discovery.run",
      entityType: "data_source",
      entityId: input.sourceId,
      summary: `Discovery run for ${source.sourceKey}: ${result.candidates} candidates, ${result.rejected} rejected, ${result.duplicates} duplicates`,
      metadata: {
        discovered: result.discovered,
        candidates: result.candidates,
        rejected: result.rejected,
        duplicates: result.duplicates,
        errors: result.errors,
      },
    });
    return {
      status: result.errors === 0 ? "SUCCEEDED" : result.candidates > 0 ? "PARTIAL" : "FAILED",
      runId: null,
      reason: result.reason,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed.";
    await recordAdminAudit({
      actorId: input.actorId,
      action: "discovery.run_failed",
      entityType: "data_source",
      entityId: input.sourceId,
      summary: `Discovery failed for ${input.source.sourceKey}: ${message}`,
    });
    throw new AdminMutationError("DISCOVERY_FAILED", message);
  }
}

export async function approveOpportunityCandidate(input: {
  actorId: string;
  candidateId: string;
}): Promise<void> {
  const { data, error } = await admin()
    .from("opportunity_candidates")
    .select("id, source_id, status, confidence, opportunity_type, merged_deal_id")
    .eq("id", input.candidateId)
    .maybeSingle();
  const candidate = throwIfQueryError("Load opportunity candidate", { data, error });
  if (!candidate) {
    throw new AdminMutationError("NOT_FOUND", "That candidate does not exist.");
  }
  const approved = candidateApprovedForPublish({
    status: "APPROVED",
    opportunityType: candidate.opportunity_type,
    confidence: candidate.confidence,
  });
  if (!approved.allowed) {
    throw new AdminMutationError("CANDIDATE_NOT_PUBLISHABLE", approved.reason ?? "Cannot approve.");
  }

  const { error: updateError } = await admin()
    .from("opportunity_candidates")
    .update({
      status: "APPROVED",
      reject_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.candidateId);
  throwIfQueryError("Approve opportunity candidate", { data: true, error: updateError });

  const source = await store().getSourceById(candidate.source_id);
  if (source && candidate.merged_deal_id) {
    const auto = autoPublishMayPublish({
      candidate: {
        status: "APPROVED",
        opportunityType: candidate.opportunity_type,
        confidence: candidate.confidence,
      },
      source: {
        enabled: source.enabled,
        reuseStatus: source.reuseStatus,
        scrapingPermitted: source.scrapingPermitted,
        autoPublish: source.autoPublish ?? false,
        autoPublishMinConfidence: source.autoPublishMinConfidence ?? 90,
      },
    });
    if (auto.allowed) {
      try {
        await publishPreviewIfLow({ actorId: input.actorId, dealId: candidate.merged_deal_id });
      } catch {
        await recordAdminAudit({
          actorId: input.actorId,
          action: "discovery.auto_publish_blocked",
          entityType: "opportunity_candidate",
          entityId: input.candidateId,
          summary: "Auto-publish was blocked by the preview gate.",
        });
      }
    }
  }

  await recordAdminAudit({
    actorId: input.actorId,
    action: "discovery.approve",
    entityType: "opportunity_candidate",
    entityId: input.candidateId,
    summary: `Approved discovery candidate ${input.candidateId}`,
    metadata: { dealId: candidate.merged_deal_id },
  });
}

export async function rejectOpportunityCandidate(input: {
  actorId: string;
  candidateId: string;
  reason: string;
}): Promise<void> {
  const { data, error } = await admin()
    .from("opportunity_candidates")
    .update({
      status: "REJECTED",
      reject_reason: input.reason.trim().slice(0, 500) || "Rejected by admin",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.candidateId)
    .select("id")
    .maybeSingle();
  throwIfQueryError("Reject opportunity candidate", { data, error });
  if (!data) {
    throw new AdminMutationError("NOT_FOUND", "That candidate does not exist.");
  }
  await recordAdminAudit({
    actorId: input.actorId,
    action: "discovery.reject",
    entityType: "opportunity_candidate",
    entityId: input.candidateId,
    summary: `Rejected discovery candidate ${input.candidateId}`,
  });
}

export async function addDiscoveryKeyword(input: {
  actorId: string;
  keyword: string;
}): Promise<void> {
  const keyword = input.keyword.replace(/\s+/g, " ").trim();
  if (keyword.length < 2 || keyword.length > 120) {
    throw new AdminMutationError("INVALID_KEYWORD", "Keywords must be 2-120 characters.");
  }
  const normalized = keyword
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const { error } = await admin().from("discovery_keywords").insert({
    keyword,
    normalized_keyword: normalized,
  });
  if (error?.code === "23505") {
    throw new AdminMutationError("DUPLICATE_KEYWORD", "That keyword already exists.");
  }
  throwIfQueryError("Add discovery keyword", { data: true, error });
  await recordAdminAudit({
    actorId: input.actorId,
    action: "discovery.keyword_add",
    entityType: "discovery_keyword",
    summary: `Added discovery keyword ${keyword}`,
    metadata: { keyword },
  });
}

export async function setDiscoveryKeywordEnabled(input: {
  actorId: string;
  keywordId: string;
  enabled: boolean;
}): Promise<void> {
  const { data, error } = await admin()
    .from("discovery_keywords")
    .update({ enabled: input.enabled, updated_at: new Date().toISOString() })
    .eq("id", input.keywordId)
    .select("keyword")
    .maybeSingle();
  throwIfQueryError("Update discovery keyword", { data, error });
  if (!data) {
    throw new AdminMutationError("NOT_FOUND", "That keyword does not exist.");
  }
  await recordAdminAudit({
    actorId: input.actorId,
    action: input.enabled ? "discovery.keyword_enable" : "discovery.keyword_disable",
    entityType: "discovery_keyword",
    entityId: input.keywordId,
    summary: `${input.enabled ? "Enabled" : "Disabled"} discovery keyword ${data.keyword}`,
  });
}

export async function runManualSourceIngestion(input: {
  actorId: string;
  sourceId: string;
}): Promise<{ status: string; runId: string | null; reason?: string }> {
  const sourceRecord = await store().getSourceById(input.sourceId);
  if (!sourceRecord) {
    throw new AdminMutationError("NOT_FOUND", "That source does not exist.");
  }
  if (sourceRecord.discoveryMethod) {
    return runManualDiscoveryIngestion({ ...input, source: sourceRecord });
  }
  const source = await loadSourceForEnable(input.sourceId);
  try {
    const adapter = getSourceAdapter(source.source_key);
    const result = await runIngestion({
      sourceKey: source.source_key,
      store: store(),
      adapter,
      triggerType: "ADMIN",
      limit: ADMIN_INGEST_LIMIT,
      force: true,
      onPreviewPublished: async (dealId) => {
        await enqueueDealMatches(dealId);
      },
    });
    await processMatchJobs({ limit: 5, maxPairs: 80 });
    await recordAdminAudit({
      actorId: input.actorId,
      action: "ingestion.run",
      entityType: "data_source",
      entityId: input.sourceId,
      summary: `Manual ingestion ${result.status} for ${source.source_key}`,
      metadata: { status: result.status, runId: result.runId },
    });
    return { status: result.status, runId: result.runId, reason: result.reason };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed.";
    await recordAdminAudit({
      actorId: input.actorId,
      action: "ingestion.run_failed",
      entityType: "data_source",
      entityId: input.sourceId,
      summary: `Manual ingestion failed for ${source.source_key}: ${message}`,
    });
    throw new AdminMutationError("INGEST_FAILED", message);
  }
}

export async function reprocessRawRecord(input: {
  actorId: string;
  rawRecordId: string;
}): Promise<{ dealId: string; published: boolean }> {
  const { data, error } = await admin()
    .from("raw_records")
    .select(
      "id, source_id, ingestion_run_id, external_record_id, source_url, published_at, fetched_at, content_hash, content_type, raw_payload, parser_version",
    )
    .eq("id", input.rawRecordId)
    .maybeSingle();
  const raw = throwIfQueryError("Failed to load raw record", { data, error });
  if (!raw) {
    throw new AdminMutationError("NOT_FOUND", "That raw record does not exist.");
  }
  const source = await loadSourceForEnable(raw.source_id);
  const adapter = getSourceAdapter(source.source_key);
  const rawRow: RawRecordRow = {
    id: raw.id,
    sourceId: raw.source_id,
    ingestionRunId: raw.ingestion_run_id,
    externalRecordId: raw.external_record_id,
    sourceUrl: raw.source_url,
    publishedAt: raw.published_at,
    fetchedAt: raw.fetched_at,
    contentHash: raw.content_hash,
    contentType: raw.content_type,
    rawPayload: raw.raw_payload,
    parserVersion: raw.parser_version,
  };
  const candidates = await adapter.parse({
    externalRecordId: raw.external_record_id,
    sourceUrl: raw.source_url ?? undefined,
    publishedAt: raw.published_at,
    fetchedAt: raw.fetched_at,
    contentType: raw.content_type ?? undefined,
    parserVersion: raw.parser_version ?? "admin-reprocess",
    payload: raw.raw_payload,
    http: {
      status: 200,
      url: raw.source_url ?? "",
      contentType: raw.content_type,
    },
  });
  if (candidates.length === 0) {
    throw new AdminMutationError("PARSE_EMPTY", "The raw record produced no canonical candidates.");
  }
  const ingestion = store();
  const sourceRecord = await ingestion.getSourceById(raw.source_id);
  if (!sourceRecord) {
    throw new AdminMutationError("NOT_FOUND", "The raw record source no longer exists.");
  }
  const persisted = await persistCandidate({
    store: ingestion,
    source: sourceRecord,
    raw: rawRow,
    candidate: candidates[0],
    now: new Date(),
  });
  const context = await contextFromPersisted({
    store: ingestion,
    deal: persisted.deal,
    now: new Date(),
  });
  let published = false;
  if (context) {
    const preview = await persistIntelligenceAndPreview({ store: ingestion, context });
    published = preview.published;
    if (published) {
      await enqueueDealMatches(persisted.deal.id);
    }
  }
  await recordAdminAudit({
    actorId: input.actorId,
    action: "raw.reprocess",
    entityType: "raw_record",
    entityId: input.rawRecordId,
    summary: `Reprocessed raw record ${raw.external_record_id} into deal ${persisted.deal.id}`,
    metadata: { dealId: persisted.deal.id, published },
  });
  return { dealId: persisted.deal.id, published };
}

export async function retryMatchJob(input: {
  actorId: string;
  jobId: string;
}): Promise<void> {
  const { data, error } = await admin()
    .from("match_jobs")
    .select("id, company_profile_id, deal_id, status")
    .eq("id", input.jobId)
    .maybeSingle();
  const job = throwIfQueryError("Failed to load match job", { data, error });
  if (!job) {
    throw new AdminMutationError("NOT_FOUND", "That match job does not exist.");
  }
  if (job.deal_id) {
    await enqueueDealMatches(job.deal_id);
  } else if (job.company_profile_id) {
    await enqueueProfileMatches(job.company_profile_id);
  }
  await processMatchJobs({ limit: 3, maxPairs: 80 });
  await recordAdminAudit({
    actorId: input.actorId,
    action: "match_job.retry",
    entityType: "match_job",
    entityId: input.jobId,
    summary: `Retried match job ${input.jobId}`,
  });
}

export async function retryDocumentJob(input: {
  actorId: string;
  documentId: string;
}): Promise<void> {
  const { data, error } = await admin()
    .from("documents")
    .update({
      processing_status: "PENDING",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.documentId)
    .select("id")
    .maybeSingle();
  throwIfQueryError("Failed to reset document processing", { data, error });
  if (!data) {
    throw new AdminMutationError("NOT_FOUND", "That document does not exist.");
  }
  await recordAdminAudit({
    actorId: input.actorId,
    action: "document.retry",
    entityType: "document",
    entityId: input.documentId,
    summary: `Queued document ${input.documentId} for reprocessing`,
  });
}
