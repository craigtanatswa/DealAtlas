import type { BuyerSector } from "@/lib/constants";
import type { Database } from "@/lib/db/database.types";
import type { DealStage, DealStatus, DealType } from "@/lib/search/filters";

export type SourceType = Database["public"]["Enums"]["source_type"];
export type AccessMethod = Database["public"]["Enums"]["access_method"];
export type ReuseStatus = Database["public"]["Enums"]["reuse_status"];
export type IngestionStatus = Database["public"]["Enums"]["ingestion_status"];
export type OrganizationRole = Database["public"]["Enums"]["organization_role"];
export type RequirementType = Database["public"]["Enums"]["requirement_type"];

export type DiscoveredItem = {
  externalRecordId: string;
  ocid?: string;
  sourceUrl?: string;
  cursor?: string;
  payload?: unknown;
};

export type DiscoverOptions = {
  limit?: number;
  updatedFrom?: string;
  updatedTo?: string;
  stages?: string;
};

export type DiscoverResult = {
  items: DiscoveredItem[];
  nextCursor?: string;
};

export type RawSourceRecord = {
  externalRecordId: string;
  sourceUrl?: string | null;
  publishedAt?: string | null;
  fetchedAt: string;
  contentType?: string | null;
  parserVersion: string;
  payload: unknown;
  http: {
    status: number;
    url: string;
    contentType: string | null;
  };
};

export type OrganizationCandidate = {
  sourcePartyId: string;
  name: string;
  roles: OrganizationRole[];
  identifier?: { scheme: string; value: string; uri?: string | null };
  additionalIdentifiers?: { scheme: string; value: string; uri?: string | null }[];
  website?: string | null;
  domain?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  countryCode?: string | null;
  contactName?: string | null;
  isSme?: boolean | null;
  isVcse?: boolean | null;
};

export type LotCandidate = {
  sourceLotId: string;
  lotNumber?: string | null;
  sourceTitle?: string | null;
  sourceDescription?: string | null;
  status?: DealStatus | null;
  currency?: string | null;
  valueMin?: number | null;
  valueMax?: number | null;
  exactLocationText?: string | null;
  submissionDeadline?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  extensionEndDate?: string | null;
  smeSuitable?: boolean | null;
  vcseSuitable?: boolean | null;
  classifications?: ClassificationCandidate[];
};

export type ClassificationCandidate = {
  scheme?: string | null;
  code?: string | null;
  description?: string | null;
  isPrimary?: boolean;
  relatedLotId?: string | null;
};

export type RequirementCandidate = {
  requirementType: RequirementType;
  name: string;
  description?: string | null;
  mandatory?: boolean | null;
  relatedLotId?: string | null;
};

export type AwardCriterionCandidate = {
  name: string;
  description?: string | null;
  criterionType?: string | null;
  weightPercent?: number | null;
  orderOfImportance?: number | null;
  relatedLotId?: string | null;
};

export type AwardCandidate = {
  awardIdentifier: string;
  title?: string | null;
  awardDate?: string | null;
  awardValue?: number | null;
  currency?: string | null;
  numberOfTenders?: number | null;
  numberOfSmeTenders?: number | null;
  numberOfVcseTenders?: number | null;
  standstillEndAt?: string | null;
  relatedLotIds?: string[];
  supplierPartyIds?: string[];
};

export type ContractCandidate = {
  contractIdentifier: string;
  awardIdentifier?: string | null;
  signedDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  extensionEndDate?: string | null;
  originalValue?: number | null;
  currentValue?: number | null;
  currency?: string | null;
  status?: string | null;
};

export type DocumentCandidate = {
  name: string;
  documentType?: string | null;
  sourceUrl: string;
  mimeType?: string | null;
  publishedAt?: string | null;
  relatedLotId?: string | null;
};

export type CanonicalCandidate = {
  sourceKey: string;
  ocid: string;
  externalPrimaryId: string;
  noticeIdentifier: string;
  releaseId: string;
  reference?: string | null;
  sourceTitle: string;
  sourceDescription?: string | null;
  sourceUrl: string;
  applicationUrl?: string | null;
  dealType: DealType;
  buyerSector: BuyerSector;
  stage: DealStage;
  status: DealStatus;
  mainCategory?: string | null;
  procurementMethod?: string | null;
  specialRegime?: string | null;
  currency: string;
  valueMinExVat?: number | null;
  valueMaxExVat?: number | null;
  exactValueText?: string | null;
  exactLocationText?: string | null;
  enquiryDeadline?: string | null;
  submissionDeadline?: string | null;
  awardDecisionDate?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  extensionEndDate?: string | null;
  nextProcurementDate?: string | null;
  estimatedRenewalDate?: string | null;
  smeSuitable?: boolean | null;
  vcseSuitable?: boolean | null;
  publishedAt?: string | null;
  modifiedAt?: string | null;
  noticeType?: string | null;
  noticeStage?: string | null;
  buyerPartyId?: string | null;
  organizations: OrganizationCandidate[];
  lots: LotCandidate[];
  requirements: RequirementCandidate[];
  awardCriteria: AwardCriterionCandidate[];
  awards: AwardCandidate[];
  contracts: ContractCandidate[];
  documents: DocumentCandidate[];
  classifications: ClassificationCandidate[];
  relatedOcids: string[];
};

export interface SourceAdapter {
  sourceKey: string;
  discover(
    cursor?: string,
    options?: DiscoverOptions,
  ): Promise<DiscoverResult>;
  fetch(item: DiscoveredItem): Promise<RawSourceRecord>;
  parse(raw: RawSourceRecord): Promise<CanonicalCandidate[]>;
}

export type IngestionCounters = {
  discovered: number;
  fetched: number;
  new: number;
  updated: number;
  unchanged: number;
  errorCount: number;
  parseFailures: number;
  duplicatesLinked: number;
  durationMs: number;
};

export type IngestionRunResult = {
  status: IngestionStatus;
  sourceKey: string;
  runId: string | null;
  reason?: string;
  cursor?: string | null;
  counters: IngestionCounters;
  errors: Array<{
    externalRecordId?: string;
    stage: string;
    code?: string;
    message: string;
  }>;
};
