import { sectorOrganisationNoun } from "@/ingestion/intelligence/types";
import type { IntelligenceContext } from "@/ingestion/intelligence/types";
import { cpvGoodsLabel } from "@/lib/preview/cpv-label";
import { isFreeTextRisky } from "@/lib/preview/risk";
import { REQUIREMENT_PREVIEW_LABELS } from "@/lib/preview/labels";
import {
  breakSourceRuns,
  quantityPhrases,
  redactFreeText,
  sourceCorpus,
  standardLabels,
} from "@/lib/preview/free-text";
import {
  deadlineBandFromDeadline,
  durationBandFromDates,
  valueBandFromAmounts,
} from "@/lib/preview/bands";
import { broadRegionFromLocation } from "@/lib/preview/region";
import { pgTrgmSimilarity } from "@/lib/redaction/gate-normalize";
import { DESCRIPTION_SIMILARITY_REVIEW } from "@/lib/redaction/scan";
import { wordShingleSimilarity } from "@/lib/redaction/similarity";
import { DEAL_TYPE_LABELS } from "@/lib/search/filters";
import type { BuyerSector } from "@/lib/constants";

export const PREVIEW_DETAIL_FIELDS = [
  "goodsServices",
  "quantities",
  "technicalSpecs",
  "standards",
  "keyDates",
  "deliveryRequirements",
  "scope",
  "commercialRequirements",
  "currency",
  "specificSector",
] as const;

export type PreviewDetailField = (typeof PREVIEW_DETAIL_FIELDS)[number];

const DETAIL_FIELD_SET = new Set<string>(PREVIEW_DETAIL_FIELDS);
const REQUIREMENT_LABEL_SET = new Set<string>(REQUIREMENT_PREVIEW_LABELS);

export type PreviewDetails = {
  goodsServices: string[];
  quantities: string[];
  technicalSpecs: string[];
  standards: string[];
  keyDates: string | null;
  deliveryRequirements: string[];
  scope: string | null;
  commercialRequirements: string[];
  currency: string | null;
  specificSector: string | null;
};

export const EMPTY_PREVIEW_DETAILS: PreviewDetails = {
  goodsServices: [],
  quantities: [],
  technicalSpecs: [],
  standards: [],
  keyDates: null,
  deliveryRequirements: [],
  scope: null,
  commercialRequirements: [],
  currency: null,
  specificSector: null,
};

function currencyCode(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function unique(items: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = item?.trim();
    if (!text || seen.has(text.toLowerCase())) {
      continue;
    }
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

export function encodePreviewDetails(details: PreviewDetails): string[] {
  const lines: string[] = [];
  const push = (field: PreviewDetailField, value: string | null | undefined) => {
    const text = value?.trim();
    if (text) {
      lines.push(`${field}: ${text}`);
    }
  };
  const join = (field: PreviewDetailField, items: string[]) => {
    if (items.length > 0) {
      push(field, items.join(" · "));
    }
  };
  join("goodsServices", details.goodsServices);
  join("quantities", details.quantities);
  join("technicalSpecs", details.technicalSpecs);
  join("standards", details.standards);
  push("keyDates", details.keyDates);
  join("deliveryRequirements", details.deliveryRequirements);
  push("scope", details.scope);
  join("commercialRequirements", details.commercialRequirements);
  push("currency", details.currency);
  push("specificSector", details.specificSector);
  return lines;
}

function splitList(value: string): string[] {
  return value
    .split(" · ")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function decodePreviewDetails(value: unknown): {
  requirements: string[];
  details: PreviewDetails;
} {
  const details: PreviewDetails = {
    ...EMPTY_PREVIEW_DETAILS,
    goodsServices: [],
    quantities: [],
    technicalSpecs: [],
    standards: [],
    deliveryRequirements: [],
    commercialRequirements: [],
  };
  const requirements: string[] = [];
  const items = Array.isArray(value) ? value : [];
  for (const item of items) {
    let field: string | null = null;
    let text = "";
    if (typeof item === "string") {
      const separator = item.indexOf(": ");
      const prefix = separator > 0 ? item.slice(0, separator) : "";
      if (DETAIL_FIELD_SET.has(prefix)) {
        field = prefix;
        text = item.slice(separator + 2).trim();
      } else if (/^[a-z][A-Za-z0-9]+$/.test(prefix)) {
        continue;
      } else {
        text = item.trim();
      }
    } else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const rawField = typeof record.field === "string" ? record.field : "";
      const rawText = typeof record.text === "string"
        ? record.text
        : typeof record.label === "string"
          ? record.label
          : "";
      if (DETAIL_FIELD_SET.has(rawField)) {
        field = rawField;
        text = rawText.trim();
      } else if (rawField) {
        continue;
      } else {
        text = rawText.trim();
      }
    }
    if (!text || text.length > 500 || /\b\d{8}\b/.test(text) || isFreeTextRisky(text)) {
      continue;
    }
    if (!field) {
      if (REQUIREMENT_LABEL_SET.has(text)) {
        requirements.push(text);
      }
      continue;
    }
    if (field === "goodsServices") details.goodsServices.push(...splitList(text));
    else if (field === "quantities") details.quantities.push(...splitList(text));
    else if (field === "technicalSpecs") details.technicalSpecs.push(...splitList(text));
    else if (field === "standards") details.standards.push(...splitList(text));
    else if (field === "keyDates") details.keyDates = text;
    else if (field === "deliveryRequirements") details.deliveryRequirements.push(...splitList(text));
    else if (field === "scope") details.scope = text;
    else if (field === "commercialRequirements") details.commercialRequirements.push(...splitList(text));
    else if (field === "currency") details.currency = /^[A-Z]{3}$/.test(text) ? text : null;
    else if (field === "specificSector") details.specificSector = text;
  }
  details.goodsServices = unique(details.goodsServices, 8);
  details.quantities = unique(details.quantities, 6);
  details.technicalSpecs = unique(details.technicalSpecs, 6);
  details.standards = unique(details.standards, 6);
  details.deliveryRequirements = unique(details.deliveryRequirements, 4);
  details.commercialRequirements = unique(details.commercialRequirements, 6);
  requirements.splice(8);
  return { requirements, details };
}

function commercialLines(
  criteria: IntelligenceContext["awardCriteria"],
): string[] {
  const lines: string[] = [];
  for (const item of criteria) {
    const blob = `${item.name} ${item.description ?? ""}`.toLowerCase();
    if (/\b(price|cost)\b/.test(blob)) {
      lines.push(`Price scored`);
    } else if (/\bquality\b/.test(blob)) {
      lines.push(`Quality scored`);
    } else if (/social value/.test(blob)) {
      lines.push(`Social value scored`);
    }
  }
  return unique(lines, 4);
}

/** Quantity units only. Exact amounts are a quasi-identifier and never ship. */
function quantityUnits(phrases: string[]): string[] {
  const units = new Set<string>();
  for (const phrase of phrases) {
    const unit = phrase.split(" ").slice(1).join(" ").trim();
    if (unit && unit !== "each") {
      units.add(unit.replace(/s$/, "") + "s");
    }
  }
  return [...units].slice(0, 4).map((unit) => `Quantities specified (${unit})`);
}

function safeProse(
  raw: string | null | undefined,
  corpus: string,
  protectedTerms: string[],
): string | null {
  // Fail closed: any identifying pattern in the source drops the field.
  if (!raw || isFreeTextRisky(raw)) {
    return null;
  }
  const redacted = redactFreeText(raw, corpus, protectedTerms);
  if (!redacted || isFreeTextRisky(redacted)) {
    return null;
  }
  const similarity = Math.max(
    pgTrgmSimilarity(raw, redacted),
    wordShingleSimilarity(raw, redacted, 4),
  );
  return similarity >= DESCRIPTION_SIMILARITY_REVIEW ? null : redacted;
}

export function composeFreePreview(
  context: IntelligenceContext,
  aggressive = false,
): { title: string; summary: string; details: PreviewDetails } {
  const { deal, lots, buyer } = context;
  const corpus = sourceCorpus([
    deal.sourceTitle,
    deal.sourceDescription,
    ...lots.flatMap((lot) => [lot.sourceTitle, lot.sourceDescription]),
    ...context.requirements.flatMap((item) => [item.name, item.description]),
  ]);
  const protectedTerms = [
    buyer?.canonicalName,
    buyer?.city,
    buyer?.domain,
    buyer?.email,
    deal.exactLocationText,
    deal.reference,
    deal.ocid,
    deal.externalPrimaryId,
    ...context.buyerAliases,
    ...lots.map((lot) => lot.exactLocationText),
  ].filter((item): item is string => Boolean(item));

  const classifications = context.classifications ?? [];
  // Goods come only from the fixed CPV division vocabulary: no leaf, no group,
  // no source description.
  const goods = unique(
    classifications.map((item) => cpvGoodsLabel(item.code)),
    4,
  );
  const sectorNoun = sectorOrganisationNoun(deal.buyerSector as BuyerSector);
  const region = broadRegionFromLocation([
    deal.exactLocationText,
    ...lots.map((lot) => lot.exactLocationText),
  ]);
  const subject = goods[0] || (deal.mainCategory && !/^(goods|services|works)$/i.test(deal.mainCategory)
    ? deal.mainCategory
    : "Commercial capability");
  const regionClause =
    !aggressive && region && region !== "Nationwide" && region !== "Remote" ? ` in ${region}` : "";
  const title = breakSourceRuns(`${subject} for a ${sectorNoun}${regionClause}`, corpus);

  const value = valueBandFromAmounts(deal.valueMinExVat, deal.valueMaxExVat);
  const currency = currencyCode(deal.currency);
  const deadlineBand = deadlineBandFromDeadline(deal.submissionDeadline, context.now, deal.status);
  const duration = durationBandFromDates(
    deal.contractStartDate,
    deal.contractEndDate,
    deal.extensionEndDate,
  );
  const standards = standardLabels([
    ...context.requirements.flatMap((item) => [item.name, item.description]),
    deal.sourceDescription,
  ]);
  const quantities = aggressive
    ? []
    : quantityUnits(
        quantityPhrases([
          deal.sourceDescription,
          ...lots.map((lot) => lot.sourceDescription),
          ...context.requirements.map((item) => item.description),
        ]),
      );
  const scope = aggressive ? null : safeProse(deal.sourceDescription, corpus, protectedTerms);
  const technical = aggressive
    ? []
    : unique(
        context.requirements
          .filter((item) => item.requirementType === "TECHNICAL")
          .map((item) => safeProse(item.description ?? item.name, corpus, protectedTerms)),
        4,
      );
  const delivery = aggressive || !region ? [] : [`Delivery within ${region}`];
  const commercial = commercialLines(context.awardCriteria);

  // Bands only. No day counts, no publication or award month.
  const keyParts = [
    deadlineBand ? `Closing window ${deadlineBand}` : null,
    duration !== "Not disclosed" ? `Contract term ${duration}` : null,
  ].filter((item): item is string => Boolean(item));

  const details: PreviewDetails = {
    goodsServices: goods,
    quantities,
    technicalSpecs: technical,
    standards,
    keyDates: keyParts.length > 0 ? keyParts.join(". ") : null,
    deliveryRequirements: delivery,
    scope,
    commercialRequirements: commercial,
    currency,
    specificSector: goods[0] ?? null,
  };

  const typeNoun = DEAL_TYPE_LABELS[deal.dealType].toLowerCase();
  const goodsClause = goods.length > 0 ? goods.join("; ") : subject.toLowerCase();
  const regionSentence = region ? ` Coverage is ${region}.` : "";
  const valueSentence = ` Estimated value ${value}${currency ? ` (${currency})` : ""}.`;
  const dateSentence = details.keyDates ? ` ${details.keyDates}.` : "";
  const standardSentence = standards.length > 0 ? ` Standards include ${standards.join("; ")}.` : "";
  const smeSentence = deal.smeSuitable === true
    ? " The notice is marked suitable for SMEs."
    : deal.smeSuitable === false
      ? " SME suitability looks limited."
      : "";
  const summary = breakSourceRuns(
    `A ${sectorNoun} is procuring ${goodsClause} through a ${typeNoun}.${regionSentence}${valueSentence}${dateSentence}${standardSentence}${smeSentence}`,
    corpus,
  );

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    summary,
    details,
  };
}
