import type { BuyerSector } from "@/lib/constants";
import type {
  AwardCandidate,
  CanonicalCandidate,
  RequirementCandidate,
} from "@/ingestion/core/types";
import type {
  DataSourceRecord,
  DealRecord,
  LotRecord,
  OrganizationRecord,
} from "@/ingestion/store/types";
import type { LeakFinding, LeakageRisk } from "@/lib/redaction/scan";

export const RULES_MODEL = {
  id: "dealatlas-rules",
  version: "1.0.0",
} as const;

export type IntelligenceLevel = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export type GenerationMethod = "RULES" | "LLM" | "HYBRID";

export type EvidenceRef = {
  source: "canonical" | "derived";
  field: string;
  note?: string;
};

export type FieldProvenance = {
  method: Exclude<GenerationMethod, "HYBRID">;
  model: string;
  version: string;
  confidence: number;
  evidence: EvidenceRef[];
  generatedAt: string;
};

export type RiskFlag = {
  code: string;
  label: string;
};

export type DealIntelligence = {
  summary: string;
  buyerNeed: string;
  idealSupplier: string;
  keyDeliverables: string[];
  mandatoryRequirements: string[];
  competitionNotes: string;
  smeAccessibility: IntelligenceLevel;
  bidComplexity: IntelligenceLevel;
  competitionLevel: IntelligenceLevel;
  deadlineUrgency: string;
  riskFlags: RiskFlag[];
  estimatedRenewalDate: string | null;
  incumbentOrganizationId: string | null;
  overallConfidence: number;
  generationMethod: GenerationMethod;
  modelVersion: string;
  fieldProvenance: Record<string, FieldProvenance>;
  generatedAt: string;
};

export type PreviewRequirement = {
  name: string;
  description?: string | null;
  requirementType?: string | null;
  mandatory?: boolean | null;
};

export type PreviewAwardCriterion = {
  name: string;
  description?: string | null;
};

export type IntelligenceContext = {
  deal: DealRecord;
  source: DataSourceRecord;
  buyer: OrganizationRecord | null;
  buyerAliases: string[];
  lots: LotRecord[];
  requirements: PreviewRequirement[];
  awardCriteria: PreviewAwardCriterion[];
  awards: Array<Pick<AwardCandidate, "numberOfTenders" | "numberOfSmeTenders">>;
  documentsCount: number;
  now: Date;
  noticeIdentifiers: string[];
};

export function contextFromCandidate(input: {
  deal: DealRecord;
  source: DataSourceRecord;
  buyer: OrganizationRecord | null;
  buyerAliases: string[];
  lots: LotRecord[];
  candidate: CanonicalCandidate;
  now: Date;
}): IntelligenceContext {
  return {
    deal: input.deal,
    source: input.source,
    buyer: input.buyer,
    buyerAliases: input.buyerAliases,
    lots: input.lots,
    requirements: input.candidate.requirements.map((item: RequirementCandidate) => ({
      name: item.name,
      description: item.description ?? null,
      requirementType: item.requirementType,
      mandatory: item.mandatory ?? null,
    })),
    awardCriteria: input.candidate.awardCriteria.map((item) => ({
      name: item.name,
      description: item.description ?? null,
    })),
    awards: input.candidate.awards.map((item) => ({
      numberOfTenders: item.numberOfTenders,
      numberOfSmeTenders: item.numberOfSmeTenders,
    })),
    documentsCount: input.candidate.documents.length,
    now: input.now,
    noticeIdentifiers: [
      input.candidate.noticeIdentifier,
      input.candidate.releaseId,
      input.candidate.externalPrimaryId,
    ].filter(Boolean),
  };
}

export function sectorOrganisationNoun(sector: BuyerSector): string {
  switch (sector) {
    case "PUBLIC":
      return "public organisation";
    case "PRIVATE":
      return "private organisation";
    case "UTILITY":
      return "utility organisation";
    case "HEALTHCARE":
      return "healthcare organisation";
    case "EDUCATION":
      return "education organisation";
    case "NONPROFIT":
      return "non-profit organisation";
    default:
      return "organisation";
  }
}

export type PreviewDraft = {
  previewTitle: string;
  previewSummary: string;
  broadRegion: string | null;
  valueBand: string;
  deadlineBand: string;
  durationBand: string;
  smeSuitability: IntelligenceLevel;
  bidComplexity: IntelligenceLevel;
  competitionLevel: IntelligenceLevel;
  requirementsPreview: string[];
  relevanceTags: string[];
  freshnessLabel: string;
  leakageRisk: LeakageRisk;
  findings: LeakFinding[];
  generationMethod: GenerationMethod;
  modelVersion: string;
};

export async function contextFromPersisted(input: {
  store: Pick<
    import("@/ingestion/store/types").IngestionStore,
    | "getOrganizationById"
    | "listOrganizationAliases"
    | "listLotsForDeal"
    | "listRequirementsForDeal"
    | "listAwardCriteriaForDeal"
    | "countDocumentsForDeal"
    | "getSourceById"
  >;
  deal: DealRecord;
  now: Date;
}): Promise<IntelligenceContext | null> {
  if (!input.deal.primarySourceId) {
    return null;
  }
  const source = await input.store.getSourceById(input.deal.primarySourceId);
  if (!source) {
    return null;
  }
  const buyer = input.deal.buyerOrganizationId
    ? await input.store.getOrganizationById(input.deal.buyerOrganizationId)
    : null;
  const buyerAliases = input.deal.buyerOrganizationId
    ? await input.store.listOrganizationAliases(input.deal.buyerOrganizationId)
    : [];
  const [lots, requirements, awardCriteria, documentsCount] = await Promise.all([
    input.store.listLotsForDeal(input.deal.id),
    input.store.listRequirementsForDeal(input.deal.id),
    input.store.listAwardCriteriaForDeal(input.deal.id),
    input.store.countDocumentsForDeal(input.deal.id),
  ]);
  return {
    deal: input.deal,
    source,
    buyer,
    buyerAliases,
    lots,
    requirements,
    awardCriteria,
    awards: [],
    documentsCount,
    now: input.now,
    noticeIdentifiers: [input.deal.externalPrimaryId, input.deal.reference, input.deal.ocid].filter(
      (item): item is string => Boolean(item),
    ),
  };
}

export type PreviewPublishResult = {
  published: boolean;
  leakageRisk: LeakageRisk;
  previewTitle: string;
  previewSummary: string;
  slug: string;
  findings: LeakFinding[];
  attempts: number;
  intelligence: DealIntelligence;
};
