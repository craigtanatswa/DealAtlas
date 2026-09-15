import {
  DEALATLAS_ANALYSIS_LABEL,
  SOURCE_RECORD_LABEL,
  type IntelligenceDealRef,
  type IntelligenceEvidence,
  type RelatedProcurementDto,
} from "@/lib/intelligence/types";

export type RelatedDealLink = {
  dealId: string;
  relatedDealId: string;
  relationshipType: string;
  confidence: number | null;
};

function dateOnly(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function sourceEvidence(relationshipType: string, confidence: number | null): IntelligenceEvidence {
  return {
    kind: "source",
    label: SOURCE_RECORD_LABEL,
    confidence: confidence ?? 1,
    field: "related_deals",
    note: `Source related process (${relationshipType}).`,
  };
}

function analysisEvidence(note: string, confidence: number): IntelligenceEvidence {
  return {
    kind: "inference",
    label: DEALATLAS_ANALYSIS_LABEL,
    confidence,
    field: "buyer_category_sequence",
    note,
  };
}

function directionFromDates(
  current: IntelligenceDealRef,
  other: IntelligenceDealRef,
): RelatedProcurementDto["direction"] {
  const currentStart =
    dateOnly(current.contractStartDate) ?? dateOnly(current.firstPublishedAt);
  const currentEnd =
    dateOnly(current.extensionEndDate) ??
    dateOnly(current.contractEndDate) ??
    dateOnly(current.awardDecisionDate);
  const otherStart = dateOnly(other.contractStartDate) ?? dateOnly(other.firstPublishedAt);
  const otherEnd =
    dateOnly(other.extensionEndDate) ??
    dateOnly(other.contractEndDate) ??
    dateOnly(other.awardDecisionDate);

  if (otherEnd && currentStart && otherEnd <= currentStart) {
    return "previous";
  }
  if (currentEnd && otherStart && currentEnd <= otherStart) {
    return "next";
  }
  return "related";
}

/**
 * Previous/next links require a source related-process row or two evidenced
 * deals for the same buyer. Dates are never invented.
 */
export function relateProcurements(input: {
  currentDealId: string;
  current: IntelligenceDealRef;
  buyerId: string | null;
  others: Array<IntelligenceDealRef & { buyerOrganizationId: string | null }>;
  links: RelatedDealLink[];
}): RelatedProcurementDto[] {
  const byId = new Map(input.others.map((deal) => [deal.id, deal]));
  const used = new Set<string>();
  const results: RelatedProcurementDto[] = [];

  for (const link of input.links) {
    const relatedId =
      link.dealId === input.currentDealId
        ? link.relatedDealId
        : link.relatedDealId === input.currentDealId
          ? link.dealId
          : null;
    if (!relatedId || relatedId === input.currentDealId) {
      continue;
    }
    const related = byId.get(relatedId);
    if (!related) {
      continue;
    }
    used.add(related.id);
    results.push({
      deal: related,
      direction: directionFromDates(input.current, related),
      relationshipType: link.relationshipType,
      evidence: sourceEvidence(link.relationshipType, link.confidence),
    });
  }

  if (!input.buyerId) {
    return results;
  }

  for (const other of input.others) {
    if (other.id === input.currentDealId || used.has(other.id)) {
      continue;
    }
    if (other.buyerOrganizationId !== input.buyerId) {
      continue;
    }
    const sameCategory =
      Boolean(input.current.mainCategory) &&
      input.current.mainCategory === other.mainCategory;
    if (!sameCategory) {
      continue;
    }
    const direction = directionFromDates(input.current, other);
    if (direction === "related") {
      continue;
    }
    results.push({
      deal: other,
      direction,
      relationshipType: direction === "previous" ? "previous_same_buyer" : "next_same_buyer",
      evidence: analysisEvidence(
        "Same buyer and category with sequenced contract dates. Not an official successor notice.",
        0.55,
      ),
    });
  }

  return results;
}

export function relateBuyerHistory(input: {
  buyerId: string;
  deals: Array<IntelligenceDealRef & { buyerOrganizationId: string | null }>;
  links: RelatedDealLink[];
}): RelatedProcurementDto[] {
  const byId = new Map(input.deals.map((deal) => [deal.id, deal]));
  const results: RelatedProcurementDto[] = [];
  const seen = new Set<string>();

  for (const deal of input.deals) {
    const related = relateProcurements({
      currentDealId: deal.id,
      current: deal,
      buyerId: input.buyerId,
      others: input.deals,
      links: input.links,
    });
    for (const item of related) {
      const key = `${deal.id}:${item.deal.id}:${item.relationshipType}`;
      if (seen.has(key) || !byId.has(item.deal.id)) {
        continue;
      }
      seen.add(key);
      results.push(item);
    }
  }

  return results;
}
