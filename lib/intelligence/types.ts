export const DEALATLAS_ANALYSIS_LABEL = "DealAtlas analysis" as const;
export const SOURCE_RECORD_LABEL = "Source record" as const;

export type IntelligenceKind = "source" | "inference";

export type IntelligenceEvidence = {
  kind: IntelligenceKind;
  label: typeof DEALATLAS_ANALYSIS_LABEL | typeof SOURCE_RECORD_LABEL;
  confidence: number;
  field: string;
  note: string;
};

export type IntelligenceOrgRef = {
  id: string;
  name: string;
};

export type IntelligenceDealRef = {
  id: string;
  sourceTitle: string;
  status: string;
  stage: string;
  dealType: string;
  mainCategory: string | null;
  buyerSector: string;
  currency: string | null;
  valueMinExVat: number | null;
  valueMaxExVat: number | null;
  firstPublishedAt: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  extensionEndDate: string | null;
  nextProcurementDate: string | null;
  estimatedRenewalDate: string | null;
  awardDecisionDate: string | null;
};

export type CategoryActivity = {
  category: string;
  dealCount: number;
  statedValueSum: number | null;
  currency: string | null;
  dealsMissingValue: number;
};

export type YearActivity = {
  year: string;
  dealCount: number;
  statedValueSum: number | null;
  currency: string | null;
};

export type AwardRecordDto = {
  id: string;
  dealId: string;
  dealTitle: string;
  awardIdentifier: string | null;
  awardDate: string | null;
  awardValue: number | null;
  currency: string | null;
  numberOfTenders: number | null;
  suppliers: Array<IntelligenceOrgRef & { awardedValue: number | null }>;
};

export type IncumbentSignalDto = {
  organization: IntelligenceOrgRef;
  dealId: string;
  dealTitle: string;
  evidence: IntelligenceEvidence;
};

export type ContractRecordDto = {
  id: string;
  dealId: string;
  dealTitle: string;
  contractIdentifier: string | null;
  status: string | null;
  signedDate: string | null;
  startDate: string | null;
  endDate: string | null;
  extensionEndDate: string | null;
  originalValue: number | null;
  currentValue: number | null;
  currency: string | null;
  buyer: IntelligenceOrgRef | null;
  suppliers: IntelligenceOrgRef[];
  payments: PaymentRecordDto[];
  performance: PerformanceRecordDto[];
};

export type PaymentRecordDto = {
  id: string;
  paymentDate: string | null;
  amountNetVat: number | null;
  currency: string | null;
};

export type PerformanceRecordDto = {
  id: string;
  reportDate: string | null;
  kpiName: string | null;
  rating: string | null;
  poorPerformance: boolean | null;
  breachReported: boolean | null;
};

export type RelatedProcurementDto = {
  deal: IntelligenceDealRef;
  direction: "previous" | "next" | "related";
  relationshipType: string;
  evidence: IntelligenceEvidence;
};

export type RenewalSignalDto = {
  dealId: string;
  dealTitle: string;
  buyer: IntelligenceOrgRef | null;
  date: string | null;
  window: "upcoming" | "expired" | "undated";
  evidence: IntelligenceEvidence[];
  primary: IntelligenceEvidence;
  incumbents: IntelligenceOrgRef[];
};

export type BuyerIntelligenceDto = {
  organization: IntelligenceOrgRef & {
    sector: string | null;
    website: string | null;
    domain: string | null;
    city: string | null;
    region: string | null;
    countryCode: string | null;
  };
  procurementHistory: IntelligenceDealRef[];
  categoryActivity: CategoryActivity[];
  yearActivity: YearActivity[];
  awards: AwardRecordDto[];
  winningSuppliers: Array<IntelligenceOrgRef & { awardCount: number; latestAwardDate: string | null }>;
  incumbents: IncumbentSignalDto[];
  contracts: ContractRecordDto[];
  expiringContracts: ContractRecordDto[];
  relatedProcurements: RelatedProcurementDto[];
  renewalSignals: RenewalSignalDto[];
};

export type SupplierIntelligenceDto = {
  organization: IntelligenceOrgRef & {
    isSme: boolean | null;
    website: string | null;
    domain: string | null;
    city: string | null;
    region: string | null;
    countryCode: string | null;
  };
  awards: AwardRecordDto[];
  buyers: Array<IntelligenceOrgRef & { awardCount: number }>;
  categoryActivity: CategoryActivity[];
  contracts: ContractRecordDto[];
  incumbents: IncumbentSignalDto[];
  competitorAwards: AwardRecordDto[];
  renewalSignals: RenewalSignalDto[];
  payments: PaymentRecordDto[];
  performance: PerformanceRecordDto[];
};

export type OrganizationListItemDto = {
  id: string;
  name: string;
  sector: string | null;
  region: string | null;
  dealCount: number;
  latestActivityAt: string | null;
};

export type OrganizationListDto = {
  items: OrganizationListItemDto[];
  page: number;
  pageSize: number;
  total: number;
};

export type ContractListDto = {
  items: ContractRecordDto[];
  page: number;
  pageSize: number;
  total: number;
};

export type RenewalListDto = {
  items: RenewalSignalDto[];
  page: number;
  pageSize: number;
  total: number;
};

export type DealHistoryDto = {
  dealId: string;
  awards: AwardRecordDto[];
  winningSuppliers: AwardRecordDto["suppliers"];
  incumbents: IncumbentSignalDto[];
  contracts: ContractRecordDto[];
  relatedProcurements: RelatedProcurementDto[];
  renewalSignals: RenewalSignalDto[];
};
