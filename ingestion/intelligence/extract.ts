import { deadlineBandFromDeadline } from "@/lib/preview/bands";
import { DEAL_TYPE_LABELS } from "@/lib/search/filters";
import {
  RULES_MODEL,
  sectorOrganisationNoun,
  type DealIntelligence,
  type EvidenceRef,
  type FieldProvenance,
  type IntelligenceContext,
  type IntelligenceLevel,
  type RiskFlag,
} from "@/ingestion/intelligence/types";
import type { LanguageModelProvider } from "@/ingestion/intelligence/provider";
import { scanPreviewLeaks, type LeakScanInput } from "@/lib/redaction/scan";

function provenance(
  field: string,
  confidence: number,
  evidence: EvidenceRef[],
  generatedAt: string,
  method: FieldProvenance["method"] = "RULES",
  model: { id: string; version: string } = RULES_MODEL,
): FieldProvenance {
  return {
    method,
    model: model.id,
    version: model.version,
    confidence,
    evidence,
    generatedAt,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function turnoverBarrier(context: IntelligenceContext): number | null {
  const blob = context.requirements
    .map((item) => `${item.name} ${item.description ?? ""}`)
    .join(" ");
  const match = blob.replace(/,/g, "").match(/turnover[^\d]{0,20}£?\s?(\d[\d.]*)\s*(m|million|k)?/i);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }
  const unit = (match[2] ?? "").toLowerCase();
  if (unit.startsWith("m")) {
    return amount * 1_000_000;
  }
  if (unit === "k") {
    return amount * 1_000;
  }
  return amount;
}

export function inferSmeSuitability(context: IntelligenceContext): {
  level: IntelligenceLevel;
  confidence: number;
  evidence: EvidenceRef[];
} {
  const evidence: EvidenceRef[] = [];
  const lotSme = context.lots.map((lot) => lot.smeSuitable).filter((item) => item != null);
  if (context.deal.smeSuitable != null) {
    evidence.push({ source: "canonical", field: "sme_suitable" });
  }
  if (lotSme.length > 0) {
    evidence.push({ source: "canonical", field: "lots.sme_suitable" });
  }
  const barrier = turnoverBarrier(context);
  const value = context.deal.valueMaxExVat ?? context.deal.valueMinExVat;
  if (barrier != null && value != null && barrier > value * 2) {
    evidence.push({ source: "derived", field: "requirements", note: "financial barrier" });
    return { level: "LOW", confidence: 0.72, evidence };
  }
  if (context.deal.smeSuitable === false) {
    return { level: "LOW", confidence: 0.9, evidence };
  }
  if (context.deal.smeSuitable === true) {
    return { level: "HIGH", confidence: 0.86, evidence };
  }
  if (lotSme.length > 0 && lotSme.every(Boolean)) {
    return { level: "HIGH", confidence: 0.7, evidence };
  }
  if (lotSme.some((item) => item === false)) {
    return { level: "LOW", confidence: 0.64, evidence };
  }
  return { level: "UNKNOWN", confidence: 0.35, evidence };
}

export function inferBidComplexity(context: IntelligenceContext): {
  level: IntelligenceLevel;
  confidence: number;
  evidence: EvidenceRef[];
} {
  const evidence: EvidenceRef[] = [
    { source: "canonical", field: "lots" },
    { source: "canonical", field: "award_criteria" },
    { source: "canonical", field: "requirements" },
  ];
  let score = 0;
  if (context.lots.length > 1) score += 2;
  if (context.lots.length > 3) score += 2;
  if (context.awardCriteria.length >= 3) score += 2;
  else if (context.awardCriteria.length > 0) score += 1;
  if (context.deal.specialRegime) score += 2;
  if (context.documentsCount >= 3) score += 1;
  if (context.deal.dealType === "FRAMEWORK" || context.deal.dealType === "DYNAMIC_MARKET") {
    score += 2;
  }
  if (context.requirements.filter((item) => item.mandatory).length >= 3) score += 1;
  if (
    score === 0 &&
    context.lots.length <= 1 &&
    context.awardCriteria.length === 0 &&
    context.requirements.length === 0
  ) {
    return { level: "UNKNOWN", confidence: 0.3, evidence };
  }
  if (score >= 5) return { level: "HIGH", confidence: 0.74, evidence };
  if (score >= 2) return { level: "MEDIUM", confidence: 0.7, evidence };
  return { level: "LOW", confidence: 0.62, evidence };
}

export function inferCompetitionLevel(context: IntelligenceContext): {
  level: IntelligenceLevel;
  confidence: number;
  evidence: EvidenceRef[];
} {
  const tenders = context.awards
    .map((award) => award.numberOfTenders)
    .filter((item): item is number => item != null);
  const evidence: EvidenceRef[] = [];
  if (tenders.length > 0) {
    evidence.push({ source: "canonical", field: "awards.number_of_tenders" });
    const count = Math.max(...tenders);
    if (count >= 6) return { level: "HIGH", confidence: 0.84, evidence };
    if (count >= 3) return { level: "MEDIUM", confidence: 0.8, evidence };
    return { level: "LOW", confidence: 0.78, evidence };
  }
  const method = (context.deal.procurementMethod ?? "").toLowerCase();
  if (method) {
    evidence.push({ source: "canonical", field: "procurement_method" });
  }
  if (/\bopen\b/.test(method)) {
    return { level: "MEDIUM", confidence: 0.55, evidence };
  }
  if (/\b(restricted|competitive|framework)\b/.test(method)) {
    return { level: "MEDIUM", confidence: 0.5, evidence };
  }
  if (
    context.deal.dealType === "PROCUREMENT_PIPELINE" ||
    context.deal.stage === "EARLY" ||
    context.deal.stage === "PLANNING"
  ) {
    return { level: "UNKNOWN", confidence: 0.34, evidence };
  }
  return { level: "UNKNOWN", confidence: 0.32, evidence };
}

function deadlineUrgency(context: IntelligenceContext): string {
  const band = deadlineBandFromDeadline(
    context.deal.submissionDeadline,
    context.now,
    context.deal.status,
  );
  if (band === "Closing today" || band === "Within 3 days") return "HIGH";
  if (band === "Within 7 days" || band === "Within 14 days") return "MEDIUM";
  return "LOW";
}

function riskFlags(context: IntelligenceContext, sme: IntelligenceLevel): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const urgency = deadlineUrgency(context);
  if (urgency === "HIGH") {
    flags.push({ code: "TIGHT_DEADLINE", label: "Short remaining response window" });
  }
  const barrier = turnoverBarrier(context);
  const value = context.deal.valueMaxExVat ?? context.deal.valueMinExVat;
  if (barrier != null && value != null && barrier > value) {
    flags.push({
      code: "HIGH_FINANCIAL_BARRIER",
      label: "Financial capacity asked may exceed typical SME comfort for this value",
    });
  }
  if (context.lots.length > 1) {
    flags.push({ code: "MULTI_LOT", label: "Multiple lots increase bid coordination effort" });
  }
  if (context.deal.specialRegime) {
    flags.push({ code: "SPECIAL_REGIME", label: "Special procurement regime applies" });
  }
  if (sme === "LOW") {
    flags.push({ code: "LIMITED_SME_ACCESS", label: "Notice or requirements look less SME-accessible" });
  }
  return flags;
}

function rulesSummary(context: IntelligenceContext): string {
  const type = DEAL_TYPE_LABELS[context.deal.dealType].toLowerCase();
  const category = context.deal.mainCategory?.toLowerCase() ?? "goods or services";
  const buyer = context.buyer?.canonicalName ?? `A ${sectorOrganisationNoun(context.deal.buyerSector)}`;
  const location = context.deal.exactLocationText
    ? ` Location recorded against the notice: ${context.deal.exactLocationText}.`
    : "";
  return `${buyer} is running a ${type} for ${category}.${location} DealAtlas treats the following as analysis, not official source wording.`;
}

function rulesBuyerNeed(context: IntelligenceContext): string {
  const description = context.deal.sourceDescription?.replace(/\s+/g, " ").trim();
  const category = context.deal.mainCategory ?? "the advertised capability";
  if (description && description.length > 40) {
    return `The buyer needs ${category.toLowerCase()} covering the outcomes described in the notice, without copying the original specification.`;
  }
  return `The buyer needs ${category.toLowerCase()} delivery from a capable supplier.`;
}

function rulesIdealSupplier(
  context: IntelligenceContext,
  sme: IntelligenceLevel,
  complexity: IntelligenceLevel,
): string {
  const smeClause =
    sme === "HIGH"
      ? "SME-capable suppliers are likely to be in scope"
      : sme === "LOW"
        ? "larger or better-capitalised suppliers may be better placed"
        : "supplier size fit is uncertain";
  const complexityClause =
    complexity === "HIGH"
      ? "experience with multi-lot or heavily evaluated bids"
      : "a focused bid team";
  return `A supplier with relevant ${context.deal.mainCategory?.toLowerCase() ?? "sector"} delivery evidence, ${complexityClause}. ${smeClause}.`;
}

function leakInputForIntelligence(
  context: IntelligenceContext,
  text: string,
): LeakScanInput {
  return {
    previewTitle: text,
    previewSummary: "",
    requirementsPreview: [],
    sourceTitle: context.deal.sourceTitle,
    sourceDescription: context.deal.sourceDescription,
    ocid: context.deal.ocid,
    reference: context.deal.reference,
    externalPrimaryId: context.deal.externalPrimaryId,
    noticeIdentifiers: context.noticeIdentifiers,
    sourceUrl: context.deal.sourceUrl,
    applicationUrl: context.deal.applicationUrl,
    sourceName: context.source.name,
    sourceKey: context.source.sourceKey,
    buyerName: null,
    buyerAliases: [],
    buyerDomain: context.buyer?.domain ?? null,
    buyerEmail: context.buyer?.email ?? null,
    buyerPhone: context.buyer?.phone ?? null,
    exactValueText: context.deal.exactValueText,
    valueMinExVat: context.deal.valueMinExVat,
    valueMaxExVat: context.deal.valueMaxExVat,
    submissionDeadline: context.deal.submissionDeadline,
    exactLocationText: context.deal.exactLocationText,
  };
}

async function maybeRewrite(
  provider: LanguageModelProvider | undefined,
  purpose: "intelligence_summary" | "buyer_need" | "ideal_supplier",
  fallback: string,
  context: IntelligenceContext,
): Promise<{ text: string; usedLlm: boolean; model: string; version: string }> {
  if (!provider || provider.id === "rules") {
    return { text: fallback, usedLlm: false, model: RULES_MODEL.id, version: RULES_MODEL.version };
  }
  try {
    const result = await provider.generate({
      purpose,
      system:
        "You write concise UK procurement analysis. Clearly infer; never invent official facts. Do not include URLs, emails, phone numbers, OCIDs or reference IDs.",
      prompt: `${purpose}\nSource title: ${context.deal.sourceTitle}\nDescription: ${context.deal.sourceDescription ?? ""}\nFallback: ${fallback}`,
    });
    const text = result?.text?.trim();
    if (!result || !text) {
      return { text: fallback, usedLlm: false, model: RULES_MODEL.id, version: RULES_MODEL.version };
    }
    const scan = scanPreviewLeaks(leakInputForIntelligence(context, text));
    if (scan.risk !== "LOW") {
      return { text: fallback, usedLlm: false, model: RULES_MODEL.id, version: RULES_MODEL.version };
    }
    return {
      text,
      usedLlm: true,
      model: result.model,
      version: result.version,
    };
  } catch {
    return { text: fallback, usedLlm: false, model: RULES_MODEL.id, version: RULES_MODEL.version };
  }
}

export async function extractDealIntelligence(
  context: IntelligenceContext,
  provider?: LanguageModelProvider,
): Promise<DealIntelligence> {
  const generatedAt = context.now.toISOString();
  const sme = inferSmeSuitability(context);
  const complexity = inferBidComplexity(context);
  const competition = inferCompetitionLevel(context);
  const flags = riskFlags(context, sme.level);
  const summaryFallback = rulesSummary(context);
  const needFallback = rulesBuyerNeed(context);
  const idealFallback = rulesIdealSupplier(context, sme.level, complexity.level);
  const summary = await maybeRewrite(provider, "intelligence_summary", summaryFallback, context);
  const buyerNeed = await maybeRewrite(provider, "buyer_need", needFallback, context);
  const ideal = await maybeRewrite(provider, "ideal_supplier", idealFallback, context);
  const usedLlm = summary.usedLlm || buyerNeed.usedLlm || ideal.usedLlm;

  const fieldProvenance: Record<string, FieldProvenance> = {
    summary: provenance(
      "summary",
      summary.usedLlm ? 0.6 : 0.72,
      [{ source: "canonical", field: "source_title" }, { source: "canonical", field: "buyer_organization_id" }],
      generatedAt,
      summary.usedLlm ? "LLM" : "RULES",
      { id: summary.model, version: summary.version },
    ),
    buyerNeed: provenance(
      "buyer_need",
      0.64,
      [{ source: "canonical", field: "source_description" }, { source: "canonical", field: "main_category" }],
      generatedAt,
      buyerNeed.usedLlm ? "LLM" : "RULES",
      { id: buyerNeed.model, version: buyerNeed.version },
    ),
    idealSupplier: provenance(
      "ideal_supplier",
      0.58,
      [{ source: "derived", field: "sme_suitability" }, { source: "derived", field: "bid_complexity" }],
      generatedAt,
      ideal.usedLlm ? "LLM" : "RULES",
      { id: ideal.model, version: ideal.version },
    ),
    smeAccessibility: provenance("sme_accessibility", sme.confidence, sme.evidence, generatedAt),
    bidComplexity: provenance("bid_complexity", complexity.confidence, complexity.evidence, generatedAt),
    competitionLevel: provenance(
      "competition_level",
      competition.confidence,
      competition.evidence,
      generatedAt,
    ),
    deadlineUrgency: provenance(
      "deadline_urgency",
      0.8,
      [{ source: "canonical", field: "submission_deadline" }],
      generatedAt,
    ),
    riskFlags: provenance("risk_flags", 0.6, [{ source: "derived", field: "risk_model" }], generatedAt),
  };

  const deliverables = [
    context.deal.mainCategory ? `${context.deal.mainCategory} delivery` : null,
    context.lots.length > 1 ? `Delivery across ${context.lots.length} lots` : null,
    "Contract mobilisation and ongoing performance",
  ].filter((item): item is string => Boolean(item));

  const mandatory = context.requirements
    .filter((item) => item.mandatory !== false)
    .map((item) => item.name)
    .slice(0, 8);

  return {
    summary: summary.text,
    buyerNeed: buyerNeed.text,
    idealSupplier: ideal.text,
    keyDeliverables: deliverables,
    mandatoryRequirements: mandatory.length > 0 ? mandatory : ["Review the notice for mandatory criteria"],
    competitionNotes:
      competition.level === "UNKNOWN"
        ? "Competition intensity is not yet evidenced from tender counts."
        : `DealAtlas estimates competition as ${competition.level.toLowerCase()} based on procedure and any tender counts.`,
    smeAccessibility: sme.level,
    bidComplexity: complexity.level,
    competitionLevel: competition.level,
    deadlineUrgency: deadlineUrgency(context),
    riskFlags: flags,
    estimatedRenewalDate: context.deal.estimatedRenewalDate,
    incumbentOrganizationId: null,
    overallConfidence: mean(Object.values(fieldProvenance).map((item) => item.confidence)),
    generationMethod: usedLlm ? "HYBRID" : "RULES",
    modelVersion: usedLlm ? `${summary.model}/${summary.version}` : `${RULES_MODEL.id}/${RULES_MODEL.version}`,
    fieldProvenance,
    generatedAt,
  };
}
