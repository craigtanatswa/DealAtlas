import "server-only";

import type { Database } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listAdminAuditEvents } from "@/lib/admin/audit";
import { ingestionReadiness, sourceEnableBlockReason } from "@/lib/admin/source-enable";
import {
  ADMIN_PAGE_SIZE,
  ADMIN_STALE_AFTER_DAYS,
} from "@/lib/admin/paths";
import { emailProviderConfigured } from "@/lib/email/send";
import { monitoringConfigured } from "@/lib/monitoring";
import { isSourceStale } from "@/lib/jobs/schedule";
import type {
  AdminBillingEventRow,
  AdminDashboard,
  AdminDealListRow,
  AdminDedupCandidate,
  AdminErrorRow,
  AdminJobRow,
  AdminJobRunRow,
  AdminListResult,
  AdminNoticeRow,
  AdminNoticeVersionRow,
  AdminOrganizationRow,
  AdminPreviewRow,
  AdminPreviewRunRow,
  AdminRawRecordRow,
  AdminRunRow,
  AdminSourceRow,
} from "@/lib/admin/types";
import type { LeakFinding } from "@/lib/redaction/scan";

const SOURCE_COLUMNS = [
  "id",
  "source_key",
  "name",
  "source_type",
  "access_method",
  "base_url",
  "api_url",
  "terms_url",
  "licence_name",
  "licence_url",
  "reuse_status",
  "scraping_permitted",
  "enabled",
  "schedule_expression",
  "rate_limit_per_minute",
  "robots_checked_at",
  "terms_checked_at",
  "compliance_notes",
  "last_success_at",
  "consecutive_failures",
  "created_at",
  "updated_at",
].join(", ");

const RUN_COLUMNS = [
  "id",
  "source_id",
  "status",
  "trigger_type",
  "cursor_value",
  "started_at",
  "finished_at",
  "discovered_count",
  "fetched_count",
  "new_count",
  "updated_count",
  "unchanged_count",
  "error_count",
  "metadata",
  "created_at",
].join(", ");

const ERROR_COLUMNS = [
  "id",
  "source_id",
  "ingestion_run_id",
  "raw_record_id",
  "external_record_id",
  "error_stage",
  "error_code",
  "message",
  "retryable",
  "details",
  "created_at",
].join(", ");

const RAW_LIST_COLUMNS = [
  "id",
  "source_id",
  "ingestion_run_id",
  "external_record_id",
  "source_url",
  "published_at",
  "fetched_at",
  "content_hash",
  "content_type",
  "parser_version",
  "created_at",
].join(", ");

const RAW_DETAIL_COLUMNS = `${RAW_LIST_COLUMNS}, raw_payload, raw_text`;

const DEAL_LIST_COLUMNS = [
  "id",
  "source_title",
  "status",
  "stage",
  "buyer_organization_id",
  "primary_source_id",
  "last_verified_at",
  "data_quality_score",
  "updated_at",
].join(", ");

const DEAL_DETAIL_COLUMNS = [
  "id",
  "primary_source_id",
  "external_primary_id",
  "ocid",
  "reference",
  "source_title",
  "source_description",
  "buyer_organization_id",
  "deal_type",
  "buyer_sector",
  "stage",
  "status",
  "main_category",
  "procurement_method",
  "special_regime",
  "currency",
  "value_min_ex_vat",
  "value_max_ex_vat",
  "exact_value_text",
  "exact_location_text",
  "enquiry_deadline",
  "submission_deadline",
  "award_decision_date",
  "contract_start_date",
  "contract_end_date",
  "extension_end_date",
  "source_url",
  "application_url",
  "first_published_at",
  "latest_source_at",
  "first_discovered_at",
  "last_verified_at",
  "data_quality_score",
  "source_count",
  "created_at",
  "updated_at",
].join(", ");

const PREVIEW_COLUMNS = [
  "deal_id",
  "slug",
  "preview_title",
  "preview_summary",
  "leakage_risk",
  "is_published",
  "unpublished_by_admin",
  "value_band",
  "deadline_band",
  "broad_region",
  "requirements_preview",
  "updated_at",
].join(", ");

const PREVIEW_RUN_COLUMNS = [
  "id",
  "deal_id",
  "attempt_number",
  "leakage_risk",
  "is_published",
  "findings",
  "generation_method",
  "model_version",
  "preview_title",
  "preview_summary",
  "created_at",
].join(", ");

const NOTICE_COLUMNS = [
  "id",
  "deal_id",
  "source_id",
  "raw_record_id",
  "notice_identifier",
  "release_id",
  "notice_type",
  "notice_stage",
  "source_url",
  "published_at",
  "modified_at",
  "is_current_version",
  "created_at",
].join(", ");

const NOTICE_VERSION_COLUMNS = [
  "id",
  "notice_id",
  "version_number",
  "content_hash",
  "captured_at",
  "raw_payload",
  "raw_text",
].join(", ");

const ORG_COLUMNS = [
  "id",
  "canonical_name",
  "normalized_name",
  "buyer_sector",
  "domain",
  "city",
  "region",
  "created_at",
  "updated_at",
].join(", ");

const BILLING_LIST_COLUMNS = [
  "id",
  "provider",
  "provider_event_id",
  "event_type",
  "status",
  "payload_hash",
  "processing_error",
  "received_at",
  "processed_at",
].join(", ");

const BILLING_DETAIL_COLUMNS = `${BILLING_LIST_COLUMNS}, payload`;

type SourceRow = Database["public"]["Tables"]["data_sources"]["Row"];
type RunRow = Database["public"]["Tables"]["ingestion_runs"]["Row"];
type ErrorRow = Database["public"]["Tables"]["ingestion_errors"]["Row"];
type DealRow = Database["public"]["Tables"]["deals"]["Row"];
type PreviewRow = Database["public"]["Tables"]["deal_previews"]["Row"];
type OrgRow = Database["public"]["Tables"]["organizations"]["Row"];
type RawRow = Database["public"]["Tables"]["raw_records"]["Row"];
type NoticeDbRow = Database["public"]["Tables"]["notices"]["Row"];
type NoticeVersionDbRow = Database["public"]["Tables"]["notice_versions"]["Row"];
type PreviewRunDbRow = Database["public"]["Tables"]["preview_generation_runs"]["Row"];
type BillingRow = Database["public"]["Tables"]["billing_events"]["Row"];

function admin() {
  return createSupabaseAdminClient();
}

function rangeFor(page: number, pageSize = ADMIN_PAGE_SIZE) {
  const safePage = Math.max(1, page);
  const from = (safePage - 1) * pageSize;
  return { from, to: from + pageSize - 1, page: safePage, pageSize };
}

function truncateJson(value: unknown, limit = 8000): string {
  try {
    const text = JSON.stringify(value, null, 2) ?? "";
    if (text.length <= limit) {
      return text;
    }
    return `${text.slice(0, limit)}\n…truncated`;
  } catch {
    return "";
  }
}

function mapSource(row: SourceRow): AdminSourceRow {
  const enableBlockedReason = sourceEnableBlockReason({
    sourceKey: row.source_key,
    reuseStatus: row.reuse_status,
    accessMethod: row.access_method,
    scrapingPermitted: row.scraping_permitted,
  });
  const ingest = ingestionReadiness({
    sourceKey: row.source_key,
    enabled: row.enabled,
    reuseStatus: row.reuse_status,
    accessMethod: row.access_method,
    scrapingPermitted: row.scraping_permitted,
    licenceName: row.licence_name,
    licenceUrl: row.licence_url,
    termsUrl: row.terms_url,
  });
  return {
    id: row.id,
    sourceKey: row.source_key,
    name: row.name,
    sourceType: row.source_type,
    accessMethod: row.access_method,
    baseUrl: row.base_url,
    apiUrl: row.api_url,
    termsUrl: row.terms_url,
    licenceName: row.licence_name,
    licenceUrl: row.licence_url,
    reuseStatus: row.reuse_status,
    scrapingPermitted: row.scraping_permitted,
    enabled: row.enabled,
    scheduleExpression: row.schedule_expression,
    rateLimitPerMinute: row.rate_limit_per_minute,
    robotsCheckedAt: row.robots_checked_at,
    termsCheckedAt: row.terms_checked_at,
    complianceNotes: row.compliance_notes,
    lastSuccessAt: row.last_success_at,
    consecutiveFailures: row.consecutive_failures,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    enableBlockedReason,
    ingestionBlockedReason: ingest.allowed ? null : ingest.reason,
    stale: isSourceStale({
      enabled: row.enabled,
      scheduleExpression: row.schedule_expression,
      lastSuccessAt: row.last_success_at,
      now: new Date(),
      staleAfterMs: ADMIN_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    }),
  };
}

function mapRun(
  row: RunRow,
  source?: Pick<SourceRow, "source_key" | "name"> | null,
): AdminRunRow {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceKey: source?.source_key ?? null,
    sourceName: source?.name ?? null,
    status: row.status,
    triggerType: row.trigger_type,
    cursorValue: row.cursor_value,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    discoveredCount: row.discovered_count,
    fetchedCount: row.fetched_count,
    newCount: row.new_count,
    updatedCount: row.updated_count,
    unchangedCount: row.unchanged_count,
    errorCount: row.error_count,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function mapError(
  row: ErrorRow,
  sourceKey: string | null,
): AdminErrorRow {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceKey,
    ingestionRunId: row.ingestion_run_id,
    rawRecordId: row.raw_record_id,
    externalRecordId: row.external_record_id,
    errorStage: row.error_stage,
    errorCode: row.error_code,
    message: row.message,
    retryable: row.retryable,
    details: row.details,
    createdAt: row.created_at,
  };
}

function mapPreview(row: PreviewRow): AdminPreviewRow {
  return {
    dealId: row.deal_id,
    slug: row.slug,
    previewTitle: row.preview_title,
    previewSummary: row.preview_summary,
    leakageRisk: row.leakage_risk,
    isPublished: row.is_published,
    unpublishedByAdmin: row.unpublished_by_admin,
    valueBand: row.value_band,
    deadlineBand: row.deadline_band,
    broadRegion: row.broad_region,
    requirementsPreview: row.requirements_preview,
    updatedAt: row.updated_at,
  };
}

function mapOrg(row: OrgRow): AdminOrganizationRow {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    normalizedName: row.normalized_name,
    buyerSector: row.buyer_sector,
    domain: row.domain,
    city: row.city,
    region: row.region,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function sourceLookup(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return new Map<string, Pick<SourceRow, "id" | "source_key" | "name">>();
  }
  const { data, error } = await admin()
    .from("data_sources")
    .select("id, source_key, name")
    .in("id", unique);
  const rows = throwIfQueryError("Failed to load source names", {
    data: data ?? [],
    error,
  });
  return new Map(rows.map((row) => [row.id, row]));
}

async function countExact(
  run: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await run();
  throwIfQueryError("Failed to count admin dashboard rows", { data: true, error });
  return count ?? 0;
}

export async function loadAdminDashboard(): Promise<AdminDashboard> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const staleBefore = new Date(
    Date.now() - ADMIN_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    sourcesTotal,
    sourcesEnabled,
    sourcesBlocked,
    failedRuns,
    skippedRuns,
    errors24h,
    unpublishedRisk,
    heldByAdmin,
    staleDeals,
    failedMatchJobs,
    failedDocuments,
    billingErrors,
    recentRunRows,
    recentErrorRows,
    leakPreviewRows,
    recentAudit,
    enabledSourceRows,
    recentJobRows,
  ] = await Promise.all([
    countExact(() =>
      admin().from("data_sources").select("source_key", { count: "exact", head: true }),
    ),
    countExact(() =>
      admin()
        .from("data_sources")
        .select("source_key", { count: "exact", head: true })
        .eq("enabled", true),
    ),
    countExact(() =>
      admin()
        .from("data_sources")
        .select("source_key", { count: "exact", head: true })
        .eq("enabled", false)
        .in("reuse_status", ["UNKNOWN", "PROHIBITED"]),
    ),
    countExact(() =>
      admin()
        .from("ingestion_runs")
        .select("source_id", { count: "exact", head: true })
        .eq("status", "FAILED")
        .gte("created_at", since),
    ),
    countExact(() =>
      admin()
        .from("ingestion_runs")
        .select("source_id", { count: "exact", head: true })
        .eq("status", "SKIPPED")
        .gte("created_at", since),
    ),
    countExact(() =>
      admin()
        .from("ingestion_errors")
        .select("message", { count: "exact", head: true })
        .gte("created_at", since),
    ),
    countExact(() =>
      admin()
        .from("deal_previews")
        .select("deal_id", { count: "exact", head: true })
        .eq("is_published", false)
        .in("leakage_risk", ["REVIEW", "HIGH"]),
    ),
    countExact(() =>
      admin()
        .from("deal_previews")
        .select("deal_id", { count: "exact", head: true })
        .eq("unpublished_by_admin", true),
    ),
    countExact(() =>
      admin()
        .from("deals")
        .select("source_title", { count: "exact", head: true })
        .eq("status", "OPEN")
        .lt("last_verified_at", staleBefore),
    ),
    countExact(() =>
      admin()
        .from("match_jobs")
        .select("status", { count: "exact", head: true })
        .eq("status", "ERROR"),
    ),
    countExact(() =>
      admin()
        .from("documents")
        .select("name", { count: "exact", head: true })
        .in("processing_status", ["ERROR", "FAILED"]),
    ),
    countExact(() =>
      admin()
        .from("billing_events")
        .select("event_type", { count: "exact", head: true })
        .eq("status", "FAILED"),
    ),
    admin()
      .from("ingestion_runs")
      .select(RUN_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(8),
    admin()
      .from("ingestion_errors")
      .select(ERROR_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(8),
    admin()
      .from("deal_previews")
      .select("deal_id, leakage_risk, is_published, unpublished_by_admin")
      .eq("is_published", false)
      .in("leakage_risk", ["REVIEW", "HIGH"])
      .order("updated_at", { ascending: false })
      .limit(8),
    listAdminAuditEvents(8),
    admin()
      .from("data_sources")
      .select("enabled, schedule_expression, last_success_at")
      .eq("enabled", true),
    admin()
      .from("job_runs")
      .select(
        "id, job_name, trigger_type, status, mode, started_at, finished_at, error_message",
      )
      .order("started_at", { ascending: false })
      .limit(8),
  ]);

  const runResult = throwIfQueryError("Failed to load recent runs", {
    data: (recentRunRows.data as RunRow[] | null) ?? [],
    error: recentRunRows.error,
  });
  const errorResult = throwIfQueryError("Failed to load recent errors", {
    data: (recentErrorRows.data as ErrorRow[] | null) ?? [],
    error: recentErrorRows.error,
  });
  const leakResult = throwIfQueryError("Failed to load leak queue", {
    data: leakPreviewRows.data ?? [],
    error: leakPreviewRows.error,
  });
  const enabledSources = throwIfQueryError("Failed to load enabled sources", {
    data:
      (enabledSourceRows.data as Array<{
        enabled: boolean;
        schedule_expression: string | null;
        last_success_at: string | null;
      }> | null) ?? [],
    error: enabledSourceRows.error,
  });
  const jobResult = throwIfQueryError("Failed to load recent job runs", {
    data:
      (recentJobRows.data as Array<{
        id: string;
        job_name: string;
        trigger_type: string;
        status: Database["public"]["Enums"]["ingestion_status"];
        mode: string;
        started_at: string;
        finished_at: string | null;
        error_message: string | null;
      }> | null) ?? [],
    error: recentJobRows.error,
  });
  const staleSources = enabledSources.filter((row) =>
    isSourceStale({
      enabled: row.enabled,
      scheduleExpression: row.schedule_expression,
      lastSuccessAt: row.last_success_at,
      now: new Date(),
      staleAfterMs: ADMIN_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    }),
  ).length;

  const sourceIds = [
    ...runResult.map((row) => row.source_id),
    ...errorResult.map((row) => row.source_id ?? ""),
  ];
  const sources = await sourceLookup(sourceIds);
  const leakDealIds = leakResult.map((row) => row.deal_id);
  const leakDeals = leakDealIds.length
    ? throwIfQueryError(
        "Failed to load leak queue deals",
        await admin()
          .from("deals")
          .select(DEAL_LIST_COLUMNS)
          .in("id", leakDealIds)
          .then((result) => ({
            data: (result.data as DealRow[] | null) ?? [],
            error: result.error,
          })),
      )
    : [];
  const leakDealMap = new Map(leakDeals.map((deal) => [deal.id, deal]));

  return {
    sources: {
      total: sourcesTotal,
      enabled: sourcesEnabled,
      blocked: sourcesBlocked,
      stale: staleSources,
    },
    runs: { failed24h: failedRuns, skipped24h: skippedRuns },
    errors24h,
    previews: {
      unpublishedRisk,
      heldByAdmin,
    },
    staleDeals,
    failedMatchJobs,
    failedDocuments,
    billingErrors,
    emailConfigured: emailProviderConfigured(),
    monitoringConfigured: monitoringConfigured(),
    recentRuns: runResult.map((row) => mapRun(row, sources.get(row.source_id))),
    recentJobRuns: jobResult.map(
      (row): AdminJobRunRow => ({
        id: row.id,
        jobName: row.job_name,
        triggerType: row.trigger_type,
        status: row.status,
        mode: row.mode,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        errorMessage: row.error_message,
      }),
    ),
    recentErrors: errorResult.map((row) =>
      mapError(row, row.source_id ? sources.get(row.source_id)?.source_key ?? null : null),
    ),
    leakQueue: leakResult.flatMap((preview) => {
      const deal = leakDealMap.get(preview.deal_id);
      if (!deal) {
        return [];
      }
      return [
        {
          id: deal.id,
          sourceTitle: deal.source_title,
          status: deal.status,
          stage: deal.stage,
          buyerName: null,
          sourceKey: null,
          leakageRisk: preview.leakage_risk,
          isPublished: preview.is_published,
          unpublishedByAdmin: preview.unpublished_by_admin,
          lastVerifiedAt: deal.last_verified_at,
          dataQualityScore: deal.data_quality_score,
          updatedAt: deal.updated_at,
        } satisfies AdminDealListRow,
      ];
    }),
    recentAudit,
  };
}

export async function listAdminSources(): Promise<AdminSourceRow[]> {
  const { data, error } = await admin()
    .from("data_sources")
    .select(SOURCE_COLUMNS)
    .order("name", { ascending: true });
  const rows = throwIfQueryError("Failed to list sources", {
    data: (data as SourceRow[] | null) ?? [],
    error,
  });
  return rows.map(mapSource);
}

export async function getAdminSource(id: string): Promise<AdminSourceRow | null> {
  const { data, error } = await admin()
    .from("data_sources")
    .select(SOURCE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  const row = throwIfQueryError("Failed to load source", {
    data: (data as SourceRow | null) ?? null,
    error,
  });
  return row ? mapSource(row) : null;
}

export async function listAdminRuns(input: {
  page: number;
  sourceId?: string;
}): Promise<AdminListResult<AdminRunRow>> {
  const { from, to, page, pageSize } = rangeFor(input.page);
  let query = admin()
    .from("ingestion_runs")
    .select(RUN_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (input.sourceId) {
    query = query.eq("source_id", input.sourceId);
  }
  const { data, error, count } = await query;
  const rows = throwIfQueryError("Failed to list ingestion runs", {
    data: (data as RunRow[] | null) ?? [],
    error,
  });
  const sources = await sourceLookup(rows.map((row) => row.source_id));
  return {
    rows: rows.map((row) => mapRun(row, sources.get(row.source_id))),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getAdminRun(id: string): Promise<AdminRunRow | null> {
  const { data, error } = await admin()
    .from("ingestion_runs")
    .select(RUN_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  const row = throwIfQueryError("Failed to load ingestion run", {
    data: (data as RunRow | null) ?? null,
    error,
  });
  if (!row) {
    return null;
  }
  const sources = await sourceLookup([row.source_id]);
  return mapRun(row, sources.get(row.source_id));
}

export async function listAdminErrors(input: {
  page: number;
  sourceId?: string;
  runId?: string;
}): Promise<AdminListResult<AdminErrorRow>> {
  const { from, to, page, pageSize } = rangeFor(input.page);
  let query = admin()
    .from("ingestion_errors")
    .select(ERROR_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (input.sourceId) {
    query = query.eq("source_id", input.sourceId);
  }
  if (input.runId) {
    query = query.eq("ingestion_run_id", input.runId);
  }
  const { data, error, count } = await query;
  const rows = throwIfQueryError("Failed to list ingestion errors", {
    data: (data as ErrorRow[] | null) ?? [],
    error,
  });
  const sources = await sourceLookup(rows.map((row) => row.source_id ?? ""));
  return {
    rows: rows.map((row) =>
      mapError(row, row.source_id ? sources.get(row.source_id)?.source_key ?? null : null),
    ),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function listAdminRawRecords(input: {
  page: number;
  sourceId?: string;
  runId?: string;
}): Promise<AdminListResult<AdminRawRecordRow>> {
  const { from, to, page, pageSize } = rangeFor(input.page);
  let query = admin()
    .from("raw_records")
    .select(RAW_LIST_COLUMNS, { count: "exact" })
    .order("fetched_at", { ascending: false })
    .range(from, to);
  if (input.sourceId) {
    query = query.eq("source_id", input.sourceId);
  }
  if (input.runId) {
    query = query.eq("ingestion_run_id", input.runId);
  }
  const { data, error, count } = await query;
  const rows = throwIfQueryError("Failed to list raw records", {
    data: (data as RawRow[] | null) ?? [],
    error,
  });
  const sources = await sourceLookup(rows.map((row) => row.source_id));
  return {
    rows: rows.map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      sourceKey: sources.get(row.source_id)?.source_key ?? null,
      ingestionRunId: row.ingestion_run_id,
      externalRecordId: row.external_record_id,
      sourceUrl: row.source_url,
      publishedAt: row.published_at,
      fetchedAt: row.fetched_at,
      contentHash: row.content_hash,
      contentType: row.content_type,
      parserVersion: row.parser_version,
      payloadPreview: "",
      createdAt: row.created_at,
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getAdminRawRecord(id: string): Promise<AdminRawRecordRow | null> {
  const { data, error } = await admin()
    .from("raw_records")
    .select(RAW_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  const row = throwIfQueryError("Failed to load raw record", {
    data: (data as RawRow | null) ?? null,
    error,
  });
  if (!row) {
    return null;
  }
  const sources = await sourceLookup([row.source_id]);
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceKey: sources.get(row.source_id)?.source_key ?? null,
    ingestionRunId: row.ingestion_run_id,
    externalRecordId: row.external_record_id,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    contentHash: row.content_hash,
    contentType: row.content_type,
    parserVersion: row.parser_version,
    payloadPreview: truncateJson(row.raw_payload ?? row.raw_text),
    createdAt: row.created_at,
  };
}

export async function listAdminDeals(input: {
  page: number;
  query?: string;
  unpublishedOnly?: boolean;
}): Promise<AdminListResult<AdminDealListRow>> {
  const { from, to, page, pageSize } = rangeFor(input.page);
  let query = admin()
    .from("deals")
    .select(DEAL_LIST_COLUMNS, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);
  if (input.query?.trim()) {
    query = query.ilike("source_title", `%${input.query.trim()}%`);
  }
  const { data, error, count } = await query;
  const deals = throwIfQueryError("Failed to list deals", {
    data: (data as DealRow[] | null) ?? [],
    error,
  });
  const dealIds = deals.map((deal) => deal.id);
  const previews = dealIds.length
    ? throwIfQueryError(
        "Failed to load deal previews",
        await admin()
          .from("deal_previews")
          .select(PREVIEW_COLUMNS)
          .in("deal_id", dealIds)
          .then((result) => ({
            data: (result.data as PreviewRow[] | null) ?? [],
            error: result.error,
          })),
      )
    : [];
  const previewMap = new Map(previews.map((row) => [row.deal_id, mapPreview(row)]));
  const buyerIds = deals.map((deal) => deal.buyer_organization_id ?? "");
  const buyers = buyerIds.filter(Boolean).length
    ? throwIfQueryError(
        "Failed to load deal buyers",
        await admin()
          .from("organizations")
          .select("id, canonical_name")
          .in("id", [...new Set(buyerIds.filter(Boolean))])
          .then((result) => ({
            data: result.data ?? [],
            error: result.error,
          })),
      )
    : [];
  const buyerMap = new Map(buyers.map((row) => [row.id, row.canonical_name]));
  const sources = await sourceLookup(deals.map((deal) => deal.primary_source_id ?? ""));
  let rows: AdminDealListRow[] = deals.map((deal) => {
    const preview = previewMap.get(deal.id);
    return {
      id: deal.id,
      sourceTitle: deal.source_title,
      status: deal.status,
      stage: deal.stage,
      buyerName: deal.buyer_organization_id
        ? buyerMap.get(deal.buyer_organization_id) ?? null
        : null,
      sourceKey: deal.primary_source_id
        ? sources.get(deal.primary_source_id)?.source_key ?? null
        : null,
      leakageRisk: preview?.leakageRisk ?? null,
      isPublished: preview?.isPublished ?? null,
      unpublishedByAdmin: preview?.unpublishedByAdmin ?? null,
      lastVerifiedAt: deal.last_verified_at,
      dataQualityScore: deal.data_quality_score,
      updatedAt: deal.updated_at,
    };
  });
  if (input.unpublishedOnly) {
    rows = rows.filter((row) => row.isPublished === false);
  }
  return { rows, total: count ?? 0, page, pageSize };
}

export async function getAdminDealDetail(dealId: string) {
  const { data, error } = await admin()
    .from("deals")
    .select(DEAL_DETAIL_COLUMNS)
    .eq("id", dealId)
    .maybeSingle();
  const deal = throwIfQueryError("Failed to load admin deal", {
    data: (data as DealRow | null) ?? null,
    error,
  });
  if (!deal) {
    return null;
  }

  const [previewResult, noticesResult, previewRunsResult, buyerResult, sourceResult] =
    await Promise.all([
      admin().from("deal_previews").select(PREVIEW_COLUMNS).eq("deal_id", dealId).maybeSingle(),
      admin()
        .from("notices")
        .select(NOTICE_COLUMNS)
        .eq("deal_id", dealId)
        .order("published_at", { ascending: false }),
      admin()
        .from("preview_generation_runs")
        .select(PREVIEW_RUN_COLUMNS)
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(12),
      deal.buyer_organization_id
        ? admin()
            .from("organizations")
            .select(ORG_COLUMNS)
            .eq("id", deal.buyer_organization_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      deal.primary_source_id
        ? admin()
            .from("data_sources")
            .select(SOURCE_COLUMNS)
            .eq("id", deal.primary_source_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  const preview = throwIfQueryError("Failed to load deal preview", {
    data: (previewResult.data as PreviewRow | null) ?? null,
    error: previewResult.error,
  });
  const noticeRows = throwIfQueryError("Failed to load notices", {
    data: (noticesResult.data as NoticeDbRow[] | null) ?? [],
    error: noticesResult.error,
  });
  const notices: AdminNoticeRow[] = noticeRows.map((row) => ({
    id: row.id,
    dealId: row.deal_id,
    sourceId: row.source_id,
    rawRecordId: row.raw_record_id,
    noticeIdentifier: row.notice_identifier,
    releaseId: row.release_id,
    noticeType: row.notice_type,
    noticeStage: row.notice_stage,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    modifiedAt: row.modified_at,
    isCurrentVersion: row.is_current_version,
    createdAt: row.created_at,
  }));
  const previewRuns = throwIfQueryError("Failed to load preview runs", {
    data: (previewRunsResult.data as PreviewRunDbRow[] | null) ?? [],
    error: previewRunsResult.error,
  });
  const buyer = throwIfQueryError("Failed to load buyer", {
    data: (buyerResult.data as OrgRow | null) ?? null,
    error: buyerResult.error,
  });
  const source = throwIfQueryError("Failed to load deal source", {
    data: (sourceResult.data as SourceRow | null) ?? null,
    error: sourceResult.error,
  });

  const noticeIds = notices.map((notice) => notice.id);
  const versions = noticeIds.length
    ? throwIfQueryError(
        "Failed to load notice versions",
        await admin()
          .from("notice_versions")
          .select(NOTICE_VERSION_COLUMNS)
          .in("notice_id", noticeIds)
          .order("version_number", { ascending: false })
          .then((result) => ({
            data: (result.data as NoticeVersionDbRow[] | null) ?? [],
            error: result.error,
          })),
      )
    : [];

  return {
    deal,
    preview: preview ? mapPreview(preview) : null,
    buyer: buyer ? mapOrg(buyer) : null,
    source: source ? mapSource(source) : null,
    notices,
    noticeVersions: versions.map(
      (row): AdminNoticeVersionRow => ({
        id: row.id,
        noticeId: row.notice_id,
        versionNumber: row.version_number,
        contentHash: row.content_hash,
        capturedAt: row.captured_at,
        payloadPreview: truncateJson(row.raw_payload ?? row.raw_text, 4000),
      }),
    ),
    previewRuns: previewRuns.map(
      (row): AdminPreviewRunRow => ({
        id: row.id,
        dealId: row.deal_id,
        attemptNumber: row.attempt_number,
        leakageRisk: row.leakage_risk,
        isPublished: row.is_published,
        findings: Array.isArray(row.findings) ? (row.findings as LeakFinding[]) : [],
        generationMethod: row.generation_method,
        modelVersion: row.model_version,
        previewTitle: row.preview_title,
        previewSummary: row.preview_summary,
        createdAt: row.created_at,
      }),
    ),
  };
}

export async function listAdminOrganisations(input: {
  page: number;
  query?: string;
}): Promise<AdminListResult<AdminOrganizationRow>> {
  const { from, to, page, pageSize } = rangeFor(input.page);
  let query = admin()
    .from("organizations")
    .select(ORG_COLUMNS, { count: "exact" })
    .order("canonical_name", { ascending: true })
    .range(from, to);
  if (input.query?.trim()) {
    query = query.ilike("canonical_name", `%${input.query.trim()}%`);
  }
  const { data, error, count } = await query;
  const rows = throwIfQueryError("Failed to list organisations", {
    data: (data as OrgRow[] | null) ?? [],
    error,
  });
  return { rows: rows.map(mapOrg), total: count ?? 0, page, pageSize };
}

export async function getAdminOrganisation(id: string) {
  const { data, error } = await admin()
    .from("organizations")
    .select(ORG_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  const org = throwIfQueryError("Failed to load organisation", {
    data: (data as OrgRow | null) ?? null,
    error,
  });
  if (!org) {
    return null;
  }
  const [aliases, identifiers, deals] = await Promise.all([
    admin()
      .from("organization_aliases")
      .select("id, alias, normalized_alias, created_at")
      .eq("organization_id", id)
      .order("alias"),
    admin()
      .from("organization_identifiers")
      .select("id, scheme, value, is_primary")
      .eq("organization_id", id),
    admin()
      .from("deals")
      .select("id, source_title, status, updated_at")
      .eq("buyer_organization_id", id)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);
  return {
    organization: mapOrg(org),
    aliases: throwIfQueryError("Failed to load aliases", {
      data: aliases.data ?? [],
      error: aliases.error,
    }),
    identifiers: throwIfQueryError("Failed to load identifiers", {
      data: identifiers.data ?? [],
      error: identifiers.error,
    }),
    deals: throwIfQueryError("Failed to load organisation deals", {
      data: deals.data ?? [],
      error: deals.error,
    }),
  };
}

export async function listAdminDedupCandidates(): Promise<AdminDedupCandidate[]> {
  const { data, error } = await admin()
    .from("ingestion_errors")
    .select("id, message, details, created_at")
    .eq("error_code", "ORG_REVIEW_CANDIDATE")
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = throwIfQueryError("Failed to load organisation review candidates", {
    data: data ?? [],
    error,
  });

  const candidates: AdminDedupCandidate[] = [];
  for (const row of rows) {
    const details = row.details as { reviewCandidateIds?: unknown } | null;
    const ids = Array.isArray(details?.reviewCandidateIds)
      ? details.reviewCandidateIds.filter((item): item is string => typeof item === "string")
      : [];
    if (ids.length < 2) {
      continue;
    }
    const orgs = throwIfQueryError(
      "Failed to load duplicate organisations",
      await admin()
        .from("organizations")
        .select("id, canonical_name")
        .in("id", ids.slice(0, 8))
        .then((result) => ({ data: result.data ?? [], error: result.error })),
    );
    const [keep, ...rest] = orgs;
    if (!keep) {
      continue;
    }
    for (const drop of rest) {
      candidates.push({
        keepId: keep.id,
        keepName: keep.canonical_name,
        dropId: drop.id,
        dropName: drop.canonical_name,
        reason: row.message,
        sourceErrorId: row.id,
      });
    }
  }
  return candidates;
}

export async function listStaleDeals(page: number): Promise<AdminListResult<AdminDealListRow>> {
  const staleBefore = new Date(
    Date.now() - ADMIN_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { from, to, page: safePage, pageSize } = rangeFor(page);
  const { data, error, count } = await admin()
    .from("deals")
    .select(DEAL_LIST_COLUMNS, { count: "exact" })
    .eq("status", "OPEN")
    .lt("last_verified_at", staleBefore)
    .order("last_verified_at", { ascending: true })
    .range(from, to);
  const deals = throwIfQueryError("Failed to list stale deals", {
    data: (data as DealRow[] | null) ?? [],
    error,
  });
  return {
    rows: deals.map((deal) => ({
      id: deal.id,
      sourceTitle: deal.source_title,
      status: deal.status,
      stage: deal.stage,
      buyerName: null,
      sourceKey: null,
      leakageRisk: null,
      isPublished: null,
      unpublishedByAdmin: null,
      lastVerifiedAt: deal.last_verified_at,
      dataQualityScore: deal.data_quality_score,
      updatedAt: deal.updated_at,
    })),
    total: count ?? 0,
    page: safePage,
    pageSize,
  };
}

export async function listFailedJobs(): Promise<AdminJobRow[]> {
  const [matchJobs, documents] = await Promise.all([
    admin()
      .from("match_jobs")
      .select("id, company_profile_id, deal_id, status, error_message, requested_at")
      .eq("status", "ERROR")
      .order("requested_at", { ascending: false })
      .limit(40),
    admin()
      .from("documents")
      .select("id, deal_id, name, processing_status, updated_at")
      .in("processing_status", ["ERROR", "FAILED"])
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);
  const matches = throwIfQueryError("Failed to list match jobs", {
    data: matchJobs.data ?? [],
    error: matchJobs.error,
  });
  const docs = throwIfQueryError("Failed to list failed documents", {
    data: documents.data ?? [],
    error: documents.error,
  });
  return [
    ...matches.map(
      (row): AdminJobRow => ({
        id: row.id,
        kind: "match",
        status: row.status,
        label: row.deal_id
          ? `Match job for deal ${row.deal_id}`
          : `Match job for profile ${row.company_profile_id}`,
        dealId: row.deal_id,
        errorMessage: row.error_message,
        requestedAt: row.requested_at,
      }),
    ),
    ...docs.map(
      (row): AdminJobRow => ({
        id: row.id,
        kind: "document",
        status: row.processing_status,
        label: row.name,
        dealId: row.deal_id,
        errorMessage: null,
        requestedAt: row.updated_at,
      }),
    ),
  ];
}

export async function listAdminBillingEvents(input: {
  page: number;
}): Promise<AdminListResult<AdminBillingEventRow>> {
  const { from, to, page, pageSize } = rangeFor(input.page);
  const { data, error, count } = await admin()
    .from("billing_events")
    .select(BILLING_LIST_COLUMNS, { count: "exact" })
    .order("received_at", { ascending: false })
    .range(from, to);
  const rows = throwIfQueryError("Failed to list billing events", {
    data: (data as BillingRow[] | null) ?? [],
    error,
  });
  return {
    rows: rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      providerEventId: row.provider_event_id,
      eventType: row.event_type,
      status: row.status,
      payloadHash: row.payload_hash,
      processingError: row.processing_error,
      receivedAt: row.received_at,
      processedAt: row.processed_at,
      payloadPreview: null,
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getAdminBillingEvent(id: string): Promise<AdminBillingEventRow | null> {
  const { data, error } = await admin()
    .from("billing_events")
    .select(BILLING_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  const row = throwIfQueryError("Failed to load billing event", {
    data: (data as BillingRow | null) ?? null,
    error,
  });
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    eventType: row.event_type,
    status: row.status,
    payloadHash: row.payload_hash,
    processingError: row.processing_error,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
    payloadPreview: truncateJson(row.payload),
  };
}

export async function listUnpublishedPreviews(page: number) {
  const { from, to, page: safePage, pageSize } = rangeFor(page);
  const { data, error, count } = await admin()
    .from("deal_previews")
    .select(PREVIEW_COLUMNS, { count: "exact" })
    .eq("is_published", false)
    .order("updated_at", { ascending: false })
    .range(from, to);
  const rows = throwIfQueryError("Failed to list unpublished previews", {
    data: (data as PreviewRow[] | null) ?? [],
    error,
  });
  return {
    rows: rows.map(mapPreview),
    total: count ?? 0,
    page: safePage,
    pageSize,
  };
}
