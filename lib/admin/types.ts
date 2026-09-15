import type { Database, Json } from "@/lib/db/database.types";
import type { LeakFinding } from "@/lib/redaction/scan";

export type AdminSourceRow = {
  id: string;
  sourceKey: string;
  name: string;
  sourceType: Database["public"]["Enums"]["source_type"];
  accessMethod: Database["public"]["Enums"]["access_method"];
  baseUrl: string | null;
  apiUrl: string | null;
  termsUrl: string | null;
  licenceName: string | null;
  licenceUrl: string | null;
  reuseStatus: Database["public"]["Enums"]["reuse_status"];
  scrapingPermitted: boolean;
  enabled: boolean;
  scheduleExpression: string | null;
  rateLimitPerMinute: number | null;
  robotsCheckedAt: string | null;
  termsCheckedAt: string | null;
  complianceNotes: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
  enableBlockedReason: string | null;
  ingestionBlockedReason: string | null;
};

export type AdminRunRow = {
  id: string;
  sourceId: string;
  sourceKey: string | null;
  sourceName: string | null;
  status: Database["public"]["Enums"]["ingestion_status"];
  triggerType: string;
  cursorValue: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  discoveredCount: number;
  fetchedCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorCount: number;
  metadata: Json;
  createdAt: string;
};

export type AdminErrorRow = {
  id: string;
  sourceId: string | null;
  sourceKey: string | null;
  ingestionRunId: string | null;
  rawRecordId: string | null;
  externalRecordId: string | null;
  errorStage: string;
  errorCode: string | null;
  message: string;
  retryable: boolean;
  details: Json;
  createdAt: string;
};

export type AdminRawRecordRow = {
  id: string;
  sourceId: string;
  sourceKey: string | null;
  ingestionRunId: string | null;
  externalRecordId: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  contentHash: string;
  contentType: string | null;
  parserVersion: string | null;
  payloadPreview: string;
  createdAt: string;
};

export type AdminDealListRow = {
  id: string;
  sourceTitle: string;
  status: Database["public"]["Enums"]["deal_status"];
  stage: Database["public"]["Enums"]["deal_stage"];
  buyerName: string | null;
  sourceKey: string | null;
  leakageRisk: Database["public"]["Enums"]["leakage_risk"] | null;
  isPublished: boolean | null;
  unpublishedByAdmin: boolean | null;
  lastVerifiedAt: string | null;
  dataQualityScore: number | null;
  updatedAt: string;
};

export type AdminPreviewRow = {
  dealId: string;
  slug: string;
  previewTitle: string;
  previewSummary: string;
  leakageRisk: Database["public"]["Enums"]["leakage_risk"];
  isPublished: boolean;
  unpublishedByAdmin: boolean;
  valueBand: string | null;
  deadlineBand: string | null;
  broadRegion: string | null;
  requirementsPreview: Json;
  updatedAt: string;
};

export type AdminPreviewRunRow = {
  id: string;
  dealId: string;
  attemptNumber: number;
  leakageRisk: Database["public"]["Enums"]["leakage_risk"];
  isPublished: boolean;
  findings: LeakFinding[];
  generationMethod: string | null;
  modelVersion: string | null;
  previewTitle: string | null;
  previewSummary: string | null;
  createdAt: string;
};

export type AdminNoticeRow = {
  id: string;
  dealId: string;
  sourceId: string;
  rawRecordId: string | null;
  noticeIdentifier: string | null;
  releaseId: string | null;
  noticeType: string | null;
  noticeStage: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  isCurrentVersion: boolean;
  createdAt: string;
};

export type AdminNoticeVersionRow = {
  id: string;
  noticeId: string;
  versionNumber: number;
  contentHash: string;
  capturedAt: string;
  payloadPreview: string;
};

export type AdminOrganizationRow = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  buyerSector: Database["public"]["Enums"]["buyer_sector"] | null;
  domain: string | null;
  city: string | null;
  region: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminDedupCandidate = {
  keepId: string;
  keepName: string;
  dropId: string;
  dropName: string;
  reason: string;
  sourceErrorId: string | null;
};

export type AdminJobRow = {
  id: string;
  kind: "match" | "document";
  status: string;
  label: string;
  dealId: string | null;
  errorMessage: string | null;
  requestedAt: string | null;
};

export type AdminBillingEventRow = {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  status: Database["public"]["Enums"]["billing_event_status"];
  payloadHash: string;
  processingError: string | null;
  receivedAt: string;
  processedAt: string | null;
  payloadPreview: string | null;
};

export type AdminAuditRow = {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
};

export type AdminDashboard = {
  sources: { total: number; enabled: number; blocked: number };
  runs: { failed24h: number; skipped24h: number };
  errors24h: number;
  previews: {
    unpublishedRisk: number;
    heldByAdmin: number;
  };
  staleDeals: number;
  failedMatchJobs: number;
  failedDocuments: number;
  billingErrors: number;
  recentRuns: AdminRunRow[];
  recentErrors: AdminErrorRow[];
  leakQueue: AdminDealListRow[];
  recentAudit: AdminAuditRow[];
};

export type AdminListResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};
