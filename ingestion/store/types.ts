import type { Database } from "@/lib/db/database.types";

import type {
  CanonicalCandidate,
  IngestionStatus,
  OrganizationRole,
} from "@/ingestion/core/types";

export type Json =
  Database["public"]["Tables"]["raw_records"]["Row"]["raw_payload"];

export type DataSourceRecord = {
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
};

export type IngestionRunRecord = {
  id: string;
  sourceId: string;
  status: IngestionStatus;
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
  metadata: Record<string, unknown>;
};

export type RawRecordRow = {
  id: string;
  sourceId: string;
  ingestionRunId: string | null;
  externalRecordId: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  contentHash: string;
  contentType: string | null;
  rawPayload: unknown;
  parserVersion: string | null;
};

export type OrganizationRecord = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  buyerSector: Database["public"]["Enums"]["buyer_sector"] | null;
  website: string | null;
  domain: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  countryCode: string | null;
  isSme: boolean | null;
  isVcse: boolean | null;
};

export type DealRecord = {
  id: string;
  primarySourceId: string | null;
  externalPrimaryId: string | null;
  ocid: string | null;
  reference: string | null;
  sourceTitle: string;
  sourceDescription: string | null;
  buyerOrganizationId: string | null;
  dealType: Database["public"]["Enums"]["deal_type"];
  buyerSector: Database["public"]["Enums"]["buyer_sector"];
  stage: Database["public"]["Enums"]["deal_stage"];
  status: Database["public"]["Enums"]["deal_status"];
  mainCategory: string | null;
  procurementMethod: string | null;
  specialRegime: string | null;
  currency: string | null;
  valueMinExVat: number | null;
  valueMaxExVat: number | null;
  exactValueText: string | null;
  exactLocationText: string | null;
  enquiryDeadline: string | null;
  submissionDeadline: string | null;
  awardDecisionDate: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  extensionEndDate: string | null;
  nextProcurementDate: string | null;
  estimatedRenewalDate: string | null;
  smeSuitable: boolean | null;
  vcseSuitable: boolean | null;
  sourceUrl: string | null;
  applicationUrl: string | null;
  firstPublishedAt: string | null;
  latestSourceAt: string | null;
  firstDiscoveredAt: string;
  lastVerifiedAt: string | null;
  dataQualityScore: number | null;
  sourceCount: number;
  normalizedTitle: string;
};

export type NoticeRecord = {
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
};

export type NoticeVersionRecord = {
  id: string;
  noticeId: string;
  versionNumber: number;
  contentHash: string;
  capturedAt: string;
};

export type LotRecord = {
  id: string;
  dealId: string;
  sourceLotId: string | null;
  lotNumber: string | null;
  sourceTitle: string | null;
  sourceDescription: string | null;
  status: Database["public"]["Enums"]["deal_status"] | null;
  currency: string | null;
  valueMin: number | null;
  valueMax: number | null;
  exactLocationText: string | null;
  submissionDeadline: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  extensionEndDate: string | null;
  smeSuitable: boolean | null;
  vcseSuitable: boolean | null;
};

export type AwardRecord = {
  id: string;
  dealId: string;
  lotId: string | null;
  sourceNoticeId: string | null;
  awardIdentifier: string | null;
  awardDate: string | null;
  awardValue: number | null;
  currency: string | null;
  numberOfTenders: number | null;
  numberOfSmeTenders: number | null;
  numberOfVcseTenders: number | null;
  standstillEndAt: string | null;
};

export type ContractRecord = {
  id: string;
  dealId: string;
  awardId: string | null;
  contractIdentifier: string | null;
  signedDate: string | null;
  startDate: string | null;
  endDate: string | null;
  extensionEndDate: string | null;
  originalValue: number | null;
  currentValue: number | null;
  currency: string | null;
  status: string | null;
};

export type DataChangeRecord = {
  id: string;
  dealId: string;
  sourceId: string | null;
  changeType: string;
  fieldName: string | null;
  previousValue: unknown;
  newValue: unknown;
  material: boolean;
  occurredAt: string;
};

export type IngestionErrorRecord = {
  id: string;
  sourceId: string | null;
  ingestionRunId: string | null;
  rawRecordId: string | null;
  externalRecordId: string | null;
  errorStage: string;
  errorCode: string | null;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
};

export type DealPreviewRecord = {
  dealId: string;
  slug: string;
  previewTitle: string;
  previewSummary: string;
  dealType: DealRecord["dealType"];
  buyerSector: DealRecord["buyerSector"];
  stage: DealRecord["stage"];
  status: DealRecord["status"];
  mainCategory: string | null;
  broadRegion: string | null;
  valueBand: string | null;
  deadlineBand: string | null;
  durationBand: string | null;
  smeSuitability: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  bidComplexity: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  competitionLevel: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  requirementsPreview: string[];
  relevanceTags: string[];
  freshnessLabel: string | null;
  leakageRisk: Database["public"]["Enums"]["leakage_risk"];
  isPublished: boolean;
};

export type DealInsightRecord = {
  dealId: string;
  summary: string | null;
  buyerNeed: string | null;
  idealSupplier: string | null;
  keyDeliverables: unknown;
  mandatoryRequirements: unknown;
  competitionNotes: string | null;
  smeAccessibility: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  bidComplexity: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  competitionLevel: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  deadlineUrgency: string | null;
  riskFlags: unknown;
  estimatedRenewalDate: string | null;
  incumbentOrganizationId: string | null;
  confidence: number | null;
  generationMethod: "RULES" | "LLM" | "HYBRID" | null;
  modelVersion: string | null;
  fieldProvenance: Json;
  generatedAt: string;
};

export type PreviewGenerationRunRecord = {
  id: string;
  dealId: string;
  attemptNumber: number;
  leakageRisk: Database["public"]["Enums"]["leakage_risk"];
  isPublished: boolean;
  findings: unknown[];
  generationMethod: string | null;
  modelVersion: string | null;
  previewTitle: string | null;
  previewSummary: string | null;
  createdAt: string;
};

export type CreateDealInput = Omit<
  DealRecord,
  "id" | "firstDiscoveredAt" | "sourceCount" | "normalizedTitle"
> & {
  id?: string;
  firstDiscoveredAt?: string;
  sourceCount?: number;
  normalizedTitle?: string;
};

export type IngestionStore = {
  getSourceByKey(sourceKey: string): Promise<DataSourceRecord | null>;
  getSourceById(id: string): Promise<DataSourceRecord | null>;
  getOrganizationById(id: string): Promise<OrganizationRecord | null>;
  listOrganizationAliases(organizationId: string): Promise<string[]>;
  listDeals(limit?: number): Promise<DealRecord[]>;
  getDealById(id: string): Promise<DealRecord | null>;
  getDealPreview(dealId: string): Promise<DealPreviewRecord | null>;
  upsertDealPreview(input: DealPreviewRecord): Promise<DealPreviewRecord>;
  upsertDealInsight(input: DealInsightRecord): Promise<void>;
  getDealInsight(dealId: string): Promise<DealInsightRecord | null>;
  insertPreviewGenerationRun(
    input: Omit<PreviewGenerationRunRecord, "id"> & { id?: string },
  ): Promise<void>;
  listRequirementsForDeal(dealId: string): Promise<
    Array<{
      name: string;
      description: string | null;
      requirementType: string;
      mandatory: boolean | null;
    }>
  >;
  listAwardCriteriaForDeal(
    dealId: string,
  ): Promise<Array<{ name: string; description: string | null }>>;
  countDocumentsForDeal(dealId: string): Promise<number>;
  updateSource(
    id: string,
    patch: Partial<
      Pick<
        DataSourceRecord,
        "lastSuccessAt" | "consecutiveFailures" | "apiUrl" | "termsCheckedAt"
      >
    >,
  ): Promise<void>;

  createRun(input: {
    sourceId: string;
    status: IngestionStatus;
    triggerType: string;
    cursorValue?: string | null;
    metadata?: Record<string, unknown>;
    startedAt?: string | null;
  }): Promise<IngestionRunRecord>;
  updateRun(
    id: string,
    patch: Partial<
      Omit<IngestionRunRecord, "id" | "sourceId" | "triggerType">
    >,
  ): Promise<void>;

  findRawRecord(
    sourceId: string,
    externalRecordId: string,
    contentHash: string,
  ): Promise<RawRecordRow | null>;
  insertRawRecord(input: Omit<RawRecordRow, "id"> & { id?: string }): Promise<{
    record: RawRecordRow;
    created: boolean;
  }>;
  insertError(input: Omit<IngestionErrorRecord, "id"> & { id?: string }): Promise<void>;

  findOrgByIdentifier(scheme: string, value: string): Promise<OrganizationRecord | null>;
  findOrgByDomain(domain: string): Promise<OrganizationRecord | null>;
  findOrgByNormalizedNameLocation(
    normalizedName: string,
    city: string | null,
    region: string | null,
  ): Promise<OrganizationRecord | null>;
  findOrgByAlias(normalizedAlias: string): Promise<OrganizationRecord | null>;
  listOrgsByNormalizedName(normalizedName: string): Promise<OrganizationRecord[]>;
  listOrganizations(): Promise<OrganizationRecord[]>;
  createOrganization(input: Omit<OrganizationRecord, "id"> & { id?: string }): Promise<OrganizationRecord>;
  addOrganizationIdentifier(input: {
    organizationId: string;
    scheme: string;
    value: string;
    uri?: string | null;
    isPrimary?: boolean;
  }): Promise<void>;
  addOrganizationAlias(input: {
    organizationId: string;
    alias: string;
    normalizedAlias: string;
    sourceId?: string | null;
  }): Promise<void>;
  addOrganizationContact(input: {
    organizationId: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    sourceId?: string | null;
    sourceUrl?: string | null;
    publishedForProcurement?: boolean;
  }): Promise<void>;

  findDealBySourceExternalId(
    sourceId: string,
    externalPrimaryId: string,
  ): Promise<DealRecord | null>;
  findDealByOcid(ocid: string): Promise<DealRecord | null>;
  findDealBySourceReference(
    sourceId: string,
    reference: string,
  ): Promise<DealRecord | null>;
  findDealByBuyerAndNormalizedTitle(
    buyerOrganizationId: string,
    normalizedTitle: string,
  ): Promise<DealRecord | null>;
  createDeal(input: CreateDealInput): Promise<DealRecord>;
  updateDeal(id: string, patch: Partial<DealRecord>): Promise<DealRecord>;

  findNotice(
    sourceId: string,
    noticeIdentifier: string,
    releaseId: string,
  ): Promise<NoticeRecord | null>;
  listNoticesForDeal(dealId: string): Promise<NoticeRecord[]>;
  createNotice(input: Omit<NoticeRecord, "id"> & { id?: string }): Promise<NoticeRecord>;
  updateNotice(id: string, patch: Partial<NoticeRecord>): Promise<NoticeRecord>;
  findNoticeVersionByHash(
    noticeId: string,
    contentHash: string,
  ): Promise<NoticeVersionRecord | null>;
  listNoticeVersions(noticeId: string): Promise<NoticeVersionRecord[]>;
  insertNoticeVersion(
    input: Omit<NoticeVersionRecord, "id"> & { id?: string },
  ): Promise<NoticeVersionRecord>;

  findLot(dealId: string, sourceLotId: string): Promise<LotRecord | null>;
  listLotsForDeal(dealId: string): Promise<LotRecord[]>;
  createLot(input: Omit<LotRecord, "id"> & { id?: string }): Promise<LotRecord>;
  updateLot(id: string, patch: Partial<LotRecord>): Promise<LotRecord>;

  deleteRequirementsForNotice(noticeId: string): Promise<void>;
  insertRequirement(input: {
    dealId: string;
    lotId?: string | null;
    requirementType: CanonicalCandidate["requirements"][number]["requirementType"];
    name: string;
    description?: string | null;
    mandatory?: boolean | null;
    sourceNoticeId?: string | null;
  }): Promise<void>;
  deleteAwardCriteriaForNotice(noticeId: string): Promise<void>;
  insertAwardCriterion(input: {
    dealId: string;
    lotId?: string | null;
    criterionName: string;
    criterionDescription?: string | null;
    criterionType?: string | null;
    weightPercent?: number | null;
    orderOfImportance?: number | null;
    sourceNoticeId?: string | null;
  }): Promise<void>;

  findAward(dealId: string, awardIdentifier: string): Promise<AwardRecord | null>;
  createAward(input: Omit<AwardRecord, "id"> & { id?: string }): Promise<AwardRecord>;
  updateAward(id: string, patch: Partial<AwardRecord>): Promise<AwardRecord>;
  addAwardSupplier(input: {
    awardId: string;
    organizationId: string;
    awardedValue?: number | null;
    isSme?: boolean | null;
    isVcse?: boolean | null;
  }): Promise<void>;

  findContract(
    dealId: string,
    contractIdentifier: string,
  ): Promise<ContractRecord | null>;
  createContract(input: Omit<ContractRecord, "id"> & { id?: string }): Promise<ContractRecord>;
  updateContract(id: string, patch: Partial<ContractRecord>): Promise<ContractRecord>;

  findDocument(dealId: string, sourceUrl: string): Promise<{ id: string } | null>;
  createDocument(input: {
    dealId: string;
    noticeId?: string | null;
    lotId?: string | null;
    sourceId?: string | null;
    name: string;
    documentType?: string | null;
    sourceUrl: string;
    mimeType?: string | null;
    publishedAt?: string | null;
    redistributionPermitted?: boolean | null;
  }): Promise<void>;

  hasDealOrganization(
    dealId: string,
    organizationId: string,
    role: OrganizationRole,
    lotId?: string | null,
  ): Promise<boolean>;
  addDealOrganization(input: {
    dealId: string;
    organizationId: string;
    role: OrganizationRole;
    lotId?: string | null;
    sourceId?: string | null;
  }): Promise<void>;

  upsertCpvCode(code: string, description: string): Promise<void>;
  findCategoryBySlug(slug: string): Promise<{ id: string; slug: string; name: string } | null>;
  hasClassification(dealId: string, cpvCode: string, lotId?: string | null): Promise<boolean>;
  insertClassification(input: {
    dealId: string;
    lotId?: string | null;
    cpvCode?: string | null;
    categoryId?: string | null;
    sourceScheme?: string | null;
    sourceCode?: string | null;
    sourceDescription?: string | null;
    isPrimary?: boolean;
  }): Promise<void>;

  insertDataChange(input: Omit<DataChangeRecord, "id"> & { id?: string }): Promise<void>;
  hasRelatedDeal(
    dealId: string,
    relatedDealId: string,
    relationshipType: string,
  ): Promise<boolean>;
  addRelatedDeal(input: {
    dealId: string;
    relatedDealId: string;
    relationshipType: string;
    confidence?: number | null;
  }): Promise<void>;
};
