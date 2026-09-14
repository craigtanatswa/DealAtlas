import type { BuyerSector } from "@/lib/constants";
import type { DealStage, DealStatus, DealType } from "@/lib/search/filters";

const PRIVATE_FUNDING = /\bprivate\b/i;
const PUBLIC_FUNDING = /\bpublic\b/i;
const MIXED_FUNDING = /\bmix\b/i;

export function mapPrivateDealType(input: {
  opportunityKind?: string | null;
  procurementStage?: string | null;
  schemeStatus?: string | null;
  funding?: string | null;
  framework?: string | null;
}): DealType {
  const kind = normalize(input.opportunityKind);
  if (kind === "rfq" || kind.includes("quotation")) {
    return "RFQ";
  }
  if (kind === "rfp" || kind.includes("proposal")) {
    return "RFP";
  }
  if (kind.includes("subcontract")) {
    return "SUBCONTRACT_OPPORTUNITY";
  }
  if (kind.includes("supply") || kind.includes("supply-chain") || kind.includes("supply_chain")) {
    return "SUPPLY_CHAIN_OPPORTUNITY";
  }
  if (kind.includes("private_tender") || kind.includes("private tender")) {
    return "PRIVATE_TENDER";
  }
  if (kind.includes("public_tender") || kind.includes("public tender")) {
    return "PUBLIC_TENDER";
  }
  if (kind.includes("award")) {
    return "AWARD";
  }
  if (kind.includes("pipeline")) {
    return "PROCUREMENT_PIPELINE";
  }

  const framework = normalize(input.framework);
  const stage = normalize(input.procurementStage);
  const status = normalize(input.schemeStatus);
  const funding = normalize(input.funding);
  const privateFunds = PRIVATE_FUNDING.test(funding) && !PUBLIC_FUNDING.test(funding.split("/")[0] ?? "");
  const publicOnly = PUBLIC_FUNDING.test(funding) && !PRIVATE_FUNDING.test(funding);

  if (status.includes("cancel") || status.includes("withdraw")) {
    return "PROCUREMENT_PIPELINE";
  }
  if (isLiveProcurement(stage, status)) {
    if (publicOnly) {
      return "PUBLIC_TENDER";
    }
    if (privateFunds || MIXED_FUNDING.test(funding)) {
      return "PRIVATE_TENDER";
    }
    return "PUBLIC_TENDER";
  }
  if (framework.includes("framework") || framework.includes("rab")) {
    return "FRAMEWORK";
  }
  if (status.includes("construction") || status.includes("operational")) {
    return privateFunds || MIXED_FUNDING.test(funding)
      ? "SUPPLY_CHAIN_OPPORTUNITY"
      : "AWARD";
  }
  if (status.includes("award") && !stage.includes("not procured")) {
    return "AWARD";
  }
  return "PROCUREMENT_PIPELINE";
}

export function mapPrivateBuyerSector(input: {
  funding?: string | null;
  sector?: string | null;
  client?: string | null;
}): BuyerSector {
  const blob = `${input.sector ?? ""} ${input.client ?? ""}`.toLowerCase();
  if (/\b(school|university|college|education)\b/.test(blob)) {
    return "EDUCATION";
  }
  if (/\b(nhs|health|hospital|social care)\b/.test(blob)) {
    return "HEALTHCARE";
  }
  if (
    /\b(water|wastewater|energy|gas|electric|utility|transmission|nuclear)\b/.test(
      blob,
    )
  ) {
    return "UTILITY";
  }
  const funding = normalize(input.funding);
  if (PRIVATE_FUNDING.test(funding) && !PUBLIC_FUNDING.test(funding)) {
    return "PRIVATE";
  }
  if (MIXED_FUNDING.test(funding) || PRIVATE_FUNDING.test(funding)) {
    return "PRIVATE";
  }
  if (PUBLIC_FUNDING.test(funding)) {
    return "PUBLIC";
  }
  return "OTHER";
}

export function mapPrivateDealStage(input: {
  procurementStage?: string | null;
  schemeStatus?: string | null;
}): DealStage {
  const status = normalize(input.schemeStatus);
  const stage = normalize(input.procurementStage);
  if (status.includes("cancel") || status.includes("withdraw")) {
    return "ENDED";
  }
  if (status.includes("construction") || status.includes("operational")) {
    return "CONTRACT";
  }
  if (status.includes("award") && !stage.includes("not procured")) {
    return "AWARD";
  }
  if (isLiveProcurement(stage, status)) {
    return "LIVE";
  }
  if (status.includes("scoping") || stage.includes("not procured")) {
    return "EARLY";
  }
  if (status.includes("design") || status.includes("planning")) {
    return "PLANNING";
  }
  return "PLANNING";
}

export function mapPrivateDealStatus(input: {
  procurementStage?: string | null;
  schemeStatus?: string | null;
}): DealStatus {
  const status = normalize(input.schemeStatus);
  const stage = normalize(input.procurementStage);
  if (status.includes("withdraw")) {
    return "WITHDRAWN";
  }
  if (status.includes("cancel")) {
    return "CANCELLED";
  }
  if (status.includes("complete") || status.includes("closed")) {
    return "CLOSED";
  }
  if (status.includes("construction") || status.includes("operational")) {
    return "ACTIVE";
  }
  if (status.includes("award") && !isLiveProcurement(stage, status)) {
    return "AWARDED";
  }
  if (isLiveProcurement(stage, status)) {
    return "OPEN";
  }
  return "UPCOMING";
}

function isTerminalStatus(status: string): boolean {
  return (
    status.includes("cancel") ||
    status.includes("withdraw") ||
    status.includes("complete") ||
    status.includes("closed")
  );
}

/** NISTA uses scheme_status "In procurement" and procurement_stage "Partially procured". */
function isLiveProcurement(stage: string, status: string): boolean {
  if (isTerminalStatus(status)) {
    return false;
  }
  if (status.includes("construction") || status.includes("operational")) {
    return false;
  }
  return (
    stage.includes("in procurement") ||
    status.includes("in procurement") ||
    stage.includes("partially procured")
  );
}

function normalize(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}
