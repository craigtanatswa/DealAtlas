import type { CanonicalCandidate } from "@/ingestion/core/types";
import type { CandidateStatus, OpportunityExtraction } from "@/ingestion/discovery/types";
import { sha256Hex } from "@/ingestion/core/hash";
import { normalizeOrgName, normalizeTitle } from "@/ingestion/normalizers/text";
import { mintPrivateOcid } from "@/ingestion/sources/private/parse";
import { sectorFromText } from "@/lib/deals/buyer-taxonomy";
import {
  mapPrivateBuyerSector,
  mapPrivateDealStage,
  mapPrivateDealStatus,
  mapPrivateDealType,
} from "@/ingestion/sources/private/mapping";

export function candidateStatusForExtraction(input: {
  extraction: OpportunityExtraction;
  onboarding: boolean;
  now: Date;
}): { status: CandidateStatus; reason: string | null } {
  if (input.onboarding || input.extraction.opportunityType === "SUPPLIER_ONBOARDING") {
    return {
      status: "REJECTED",
      reason: "Supplier onboarding page, not a live opportunity",
    };
  }
  if (!input.extraction.isOpportunity) {
    return {
      status: "REJECTED",
      reason: input.extraction.rejectionReason ?? "Not a procurement opportunity",
    };
  }
  if (input.extraction.deadline) {
    const deadline = new Date(input.extraction.deadline);
    if (!Number.isNaN(deadline.getTime()) && deadline.getTime() <= input.now.getTime()) {
      return { status: "EXPIRED", reason: "Opportunity deadline has passed" };
    }
  }
  return { status: "PENDING_REVIEW", reason: null };
}

export function canonicalFromExtraction(input: {
  sourceKey: string;
  url: string;
  extraction: OpportunityExtraction;
  now: Date;
}): CanonicalCandidate {
  const { extraction } = input;
  const title = extraction.title?.trim() || "Untitled procurement opportunity";
  const summary = extraction.summary?.trim() || null;
  const externalId = sha256Hex(input.url).slice(0, 24);
  const buyerName = extraction.buyerName?.trim() || null;
  const buyerDomain = extraction.buyerDomain?.trim().toLowerCase() || null;
  const dealType = extraction.opportunityType
    ? extraction.opportunityType
    : mapPrivateDealType({
        opportunityKind: extraction.title,
        schemeStatus: null,
        procurementStage: null,
      });
  const buyerSector = mapPrivateBuyerSector({
    funding: null,
    sector: extraction.sector,
    client: buyerName,
  });
  const status = mapPrivateDealStatus({
    procurementStage: dealType,
    schemeStatus: extraction.deadline ? "in procurement" : "upcoming",
  });
  const stage = mapPrivateDealStage({
    procurementStage: dealType,
    schemeStatus: extraction.deadline ? "in procurement" : "upcoming",
  });
  const deadline = extraction.deadline;
  const organizations: CanonicalCandidate["organizations"] = buyerName
    ? [
        {
          sourcePartyId: normalizeOrgName(buyerName).replace(/\s+/g, "-").slice(0, 80) || "buyer",
          name: buyerName,
          roles: ["BUYER"],
          website: buyerDomain ? `https://${buyerDomain}` : null,
          domain: buyerDomain,
          countryCode: "GB",
        },
      ]
    : [];

  const requirements = extraction.requirements
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);

  return {
    sourceKey: input.sourceKey,
    ocid: mintPrivateOcid(input.sourceKey, externalId),
    externalPrimaryId: externalId,
    noticeIdentifier: externalId,
    releaseId: externalId,
    reference: null,
    sourceTitle: title.slice(0, 500),
    sourceDescription: summary,
    sourceUrl: input.url,
    applicationUrl: null,
    dealType,
    buyerSector,
    buyerType: "PRIVATE",
    sector: sectorFromText(extraction.sector ?? buyerName),
    stage,
    status,
    mainCategory: extraction.sector,
    procurementMethod: null,
    specialRegime: null,
    currency: "GBP",
    valueMinExVat: parseBudget(extraction.budgetText),
    valueMaxExVat: parseBudget(extraction.budgetText),
    exactValueText: extraction.budgetText,
    exactLocationText: extraction.location,
    enquiryDeadline: null,
    submissionDeadline: deadline,
    awardDecisionDate: null,
    contractStartDate: null,
    contractEndDate: null,
    extensionEndDate: null,
    nextProcurementDate: null,
    estimatedRenewalDate: null,
    smeSuitable: null,
    vcseSuitable: null,
    publishedAt: null,
    modifiedAt: input.now.toISOString(),
    noticeType: "DISCOVERED",
    noticeStage: null,
    buyerPartyId: organizations[0]?.sourcePartyId ?? null,
    organizations,
    lots: [],
    requirements:
      requirements.length > 0
        ? requirements.map((name) => ({
            requirementType: "OTHER" as const,
            name,
            description: null,
            mandatory: null,
          }))
        : summary
          ? [
              {
                requirementType: "OTHER" as const,
                name: "Source summary",
                description: summary,
                mandatory: false,
              },
            ]
          : [],
    awardCriteria: [],
    awards: [],
    contracts: [],
    documents: [
      {
        name: "Discovered opportunity page",
        documentType: "notice",
        sourceUrl: input.url,
        mimeType: "text/html",
      },
    ],
    classifications: extraction.sector
      ? [
          {
            scheme: "DISCOVERY",
            code: normalizeTitle(extraction.sector).replace(/\s+/g, "_"),
            description: extraction.sector,
            isPrimary: true,
          },
        ]
      : [],
    relatedOcids: [],
  };
}

function parseBudget(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = value.replace(/,/g, "").match(/(?:£|\bgbp\s*)?([0-9]+(?:\.[0-9]{1,2})?)\s*(k|m|million|thousand)?/i);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }
  const suffix = match[2]?.toLowerCase();
  if (suffix === "k" || suffix === "thousand") {
    return amount * 1_000;
  }
  if (suffix === "m" || suffix === "million") {
    return amount * 1_000_000;
  }
  return amount;
}
