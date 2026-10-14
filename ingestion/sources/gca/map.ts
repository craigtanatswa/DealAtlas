import { IngestionError } from "@/ingestion/core/errors";
import type { CanonicalCandidate } from "@/ingestion/core/types";
import type { DealStage, DealStatus, DealType } from "@/lib/search/filters";

import { GCA_BUYER_NAME, gcaAgreementUrl } from "@/ingestion/sources/gca/constants";
import { blank, isRmNumber, normaliseRm, stripHtml } from "@/ingestion/sources/gca/text";

export type GcaStatus = {
  status: DealStatus;
  stage: DealStage;
  dealType: DealType;
};

export function dealTypeFromLabel(label: string | null): DealType {
  const text = (label ?? "").toLowerCase();
  if (text.includes("dynamic") || text.includes("dps")) {
    return "DYNAMIC_MARKET";
  }
  if (text.includes("framework")) {
    return "FRAMEWORK";
  }
  return "PROCUREMENT_PIPELINE";
}

export function agreementStatus(input: {
  status: string | null;
  terms: string | null;
  regulationType: string | null;
  endDate: string | null;
  now: Date;
}): GcaStatus {
  const label = `${input.terms ?? ""} ${input.regulationType ?? ""}`;
  const dealType = dealTypeFromLabel(label);
  const end = input.endDate ? Date.parse(`${input.endDate}T00:00:00.000Z`) : Number.NaN;
  if (Number.isFinite(end) && end < input.now.getTime()) {
    return { status: "EXPIRED", stage: "ENDED", dealType };
  }
  const status = (input.status ?? "").toLowerCase();
  if (status.includes("future") || status.includes("planned")) {
    return { status: "UPCOMING", stage: "PLANNING", dealType: "PROCUREMENT_PIPELINE" };
  }
  if (status.includes("underway") || status === "live") {
    return {
      status: "OPEN",
      stage: "LIVE",
      dealType: dealType === "PROCUREMENT_PIPELINE" ? "FRAMEWORK" : dealType,
    };
  }
  if (status.includes("awarded")) {
    return { status: "AWARDED", stage: "AWARD", dealType };
  }
  return { status: "UPCOMING", stage: "PLANNING", dealType: "PROCUREMENT_PIPELINE" };
}

export function pipelineStatus(procurementStart: string | null, now: Date, agreementType: string | null): GcaStatus {
  const start = procurementStart ? Date.parse(`${procurementStart}T00:00:00.000Z`) : Number.NaN;
  const dealType = dealTypeFromLabel(agreementType);
  if (!Number.isFinite(start) || start > now.getTime()) {
    return { status: "UPCOMING", stage: "PLANNING", dealType };
  }
  return {
    status: "OPEN",
    stage: "LIVE",
    dealType: dealType === "PROCUREMENT_PIPELINE" ? "FRAMEWORK" : dealType,
  };
}

export function gcaCandidate(input: {
  sourceKey: string;
  rm: string;
  title: string;
  description: string | null;
  category: string | null;
  mapped: GcaStatus;
  now: Date;
  contactEmail?: string | null;
  contactPhone?: string | null;
  cpvCode?: string | null;
  cpvDescription?: string | null;
  procurementMethod?: string | null;
  specialRegime?: string | null;
  exactValueText?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  nextProcurementDate?: string | null;
  lots?: Array<{ title: string; description: string | null }>;
}): CanonicalCandidate {
  const rm = normaliseRm(input.rm);
  if (!isRmNumber(rm) || !input.title.trim()) {
    throw new IngestionError({
      message: "GCA record is missing an RM number or title.",
      stage: "parse",
      code: "GCA_RECORD_INCOMPLETE",
      retryable: false,
    });
  }
  const sourceUrl = gcaAgreementUrl(rm);
  const organizations: CanonicalCandidate["organizations"] = [
    {
      sourcePartyId: "government-commercial-agency",
      name: GCA_BUYER_NAME,
      roles: ["BUYER"],
      countryCode: "GB",
      email: input.contactEmail ?? null,
      phone: input.contactPhone ?? null,
    },
  ];
  const description = input.description ? stripHtml(input.description) : null;
  return {
    sourceKey: input.sourceKey,
    ocid: `da-${input.sourceKey}-${rm}`,
    externalPrimaryId: rm,
    noticeIdentifier: rm,
    releaseId: rm,
    reference: rm,
    sourceTitle: input.title.trim(),
    sourceDescription: description,
    sourceUrl,
    applicationUrl: null,
    dealType: input.mapped.dealType,
    buyerSector: "PUBLIC",
    stage: input.mapped.stage,
    status: input.mapped.status,
    mainCategory: blank(input.category),
    procurementMethod: input.procurementMethod ?? null,
    specialRegime: input.specialRegime ?? null,
    currency: "GBP",
    valueMinExVat: null,
    valueMaxExVat: null,
    exactValueText: input.exactValueText ?? null,
    exactLocationText: null,
    enquiryDeadline: null,
    submissionDeadline: null,
    awardDecisionDate: null,
    contractStartDate: input.contractStartDate ?? null,
    contractEndDate: input.contractEndDate ?? null,
    extensionEndDate: null,
    nextProcurementDate: input.nextProcurementDate ?? null,
    estimatedRenewalDate: null,
    smeSuitable: null,
    vcseSuitable: null,
    publishedAt: null,
    modifiedAt: input.now.toISOString(),
    noticeType: input.mapped.dealType,
    noticeStage: input.mapped.status,
    buyerPartyId: organizations[0]?.sourcePartyId ?? null,
    organizations,
    lots: (input.lots ?? [])
      .filter((lot) => lot.title.trim() && lot.title.trim() !== input.title.trim())
      .map((lot, index) => ({
        sourceLotId: String(index + 1),
        sourceTitle: stripHtml(lot.title),
        sourceDescription: lot.description ? stripHtml(lot.description) : null,
        status: input.mapped.status,
      })),
    requirements: [],
    awardCriteria: [],
    awards: [],
    contracts: [],
    documents: [],
    classifications: input.cpvCode
      ? [
          {
            scheme: "CPV",
            code: input.cpvCode,
            description: input.cpvDescription ?? input.cpvCode,
            isPrimary: true,
          },
        ]
      : [],
    relatedOcids: [],
  };
}

export function parseContact(value: string | null): { email: string | null; phone: string | null } {
  const text = value ?? "";
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0] ?? null;
  const phone = /(?:\+44|0)\d[\d\s]{8,14}\d/.exec(text)?.[0]?.replace(/\s+/g, " ") ?? null;
  return { email, phone };
}

export function includingVatText(value: string | null): string | null {
  if (!value || !/[0-9]/.test(value)) {
    return null;
  }
  return `${value} including VAT`;
}
