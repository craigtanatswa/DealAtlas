import {
  DEALATLAS_ANALYSIS_LABEL,
  SOURCE_RECORD_LABEL,
  type IntelligenceEvidence,
  type RenewalSignalDto,
} from "@/lib/intelligence/types";

export const RENEWAL_LOOKAHEAD_DAYS = 548;
export const RENEWAL_LOOKBEHIND_DAYS = 60;

export type RenewalDateFact = {
  date: string;
  field: string;
  note: string;
  kind: "source" | "inference";
  confidence: number;
};

export type RenewalCandidateInput = {
  dealId: string;
  dealTitle: string;
  dealType: string;
  status: string;
  buyer: RenewalSignalDto["buyer"];
  incumbents: RenewalSignalDto["incumbents"];
  facts: RenewalDateFact[];
};

function toUtcDate(value: string): Date | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed);
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function isoDateOnly(value: string): string {
  return value.slice(0, 10);
}

export function evidenceFromFact(fact: RenewalDateFact): IntelligenceEvidence {
  return {
    kind: fact.kind,
    label: fact.kind === "inference" ? DEALATLAS_ANALYSIS_LABEL : SOURCE_RECORD_LABEL,
    confidence: fact.confidence,
    field: fact.field,
    note: fact.note,
  };
}

export function classifyRenewalWindow(
  date: string | null,
  now: Date,
): RenewalSignalDto["window"] {
  if (!date) {
    return "undated";
  }
  const parsed = toUtcDate(date);
  if (!parsed) {
    return "undated";
  }
  const today = startOfUtcDay(now).getTime();
  const target = startOfUtcDay(parsed).getTime();
  if (target < today) {
    return "expired";
  }
  return "upcoming";
}

export function isRenewalDateInScope(date: string, now: Date): boolean {
  const parsed = toUtcDate(date);
  if (!parsed) {
    return false;
  }
  const today = startOfUtcDay(now).getTime();
  const target = startOfUtcDay(parsed).getTime();
  const ahead = RENEWAL_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;
  const behind = RENEWAL_LOOKBEHIND_DAYS * 24 * 60 * 60 * 1000;
  return target >= today - behind && target <= today + ahead;
}

/**
 * Rank evidenced renewal dates. Never synthesises a date from duration or
 * award year. Source contract/deal dates outrank DealAtlas insight copies.
 */
export function selectRenewalFacts(facts: RenewalDateFact[], now: Date): RenewalDateFact[] {
  const ranked = facts
    .filter((fact) => isoDateOnly(fact.date).length === 10)
    .filter((fact) => isRenewalDateInScope(fact.date, now))
    .slice()
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "source" ? -1 : 1;
      }
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }
      return isoDateOnly(left.date).localeCompare(isoDateOnly(right.date));
    });

  const seen = new Set<string>();
  const unique: RenewalDateFact[] = [];
  for (const fact of ranked) {
    const key = `${isoDateOnly(fact.date)}:${fact.field}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(fact);
  }

  const sourceDates = new Set(
    unique.filter((fact) => fact.kind === "source").map((fact) => isoDateOnly(fact.date)),
  );
  return unique.filter(
    (fact) => fact.kind === "source" || !sourceDates.has(isoDateOnly(fact.date)),
  );
}

export function buildRenewalSignal(
  input: RenewalCandidateInput,
  now: Date,
): RenewalSignalDto | null {
  const facts = selectRenewalFacts(input.facts, now);
  const openRenewalNotice =
    input.dealType === "CONTRACT_RENEWAL" &&
    (input.status === "OPEN" ||
      input.status === "UPCOMING" ||
      input.status === "CLOSING_SOON");

  if (facts.length === 0 && !openRenewalNotice) {
    return null;
  }

  const primaryFact = facts[0];
  const noticeEvidence: IntelligenceEvidence = {
    kind: "source",
    label: SOURCE_RECORD_LABEL,
    confidence: 0.62,
    field: "deal_type",
    note: "Notice is recorded as a contract renewal opportunity.",
  };
  const evidence = facts.map(evidenceFromFact);
  if (openRenewalNotice) {
    evidence.push(noticeEvidence);
  }

  const primary = primaryFact ? evidenceFromFact(primaryFact) : noticeEvidence;

  return {
    dealId: input.dealId,
    dealTitle: input.dealTitle,
    buyer: input.buyer,
    date: primaryFact ? isoDateOnly(primaryFact.date) : null,
    window: classifyRenewalWindow(primaryFact?.date ?? null, now),
    evidence,
    primary,
    incumbents: input.incumbents,
  };
}

export function contractExpiryFacts(input: {
  endDate: string | null;
  extensionEndDate: string | null;
}): RenewalDateFact[] {
  const facts: RenewalDateFact[] = [];
  if (input.extensionEndDate) {
    facts.push({
      date: input.extensionEndDate,
      field: "contracts.extension_end_date",
      note: "Recorded contract extension end date.",
      kind: "source",
      confidence: 0.92,
    });
  }
  if (input.endDate) {
    facts.push({
      date: input.endDate,
      field: "contracts.end_date",
      note: "Recorded contract end date.",
      kind: "source",
      confidence: 0.88,
    });
  }
  return facts;
}

export function dealDateFacts(input: {
  contractEndDate: string | null;
  extensionEndDate: string | null;
  estimatedRenewalDate: string | null;
  nextProcurementDate: string | null;
}): RenewalDateFact[] {
  const facts: RenewalDateFact[] = [];
  if (input.extensionEndDate) {
    facts.push({
      date: input.extensionEndDate,
      field: "deals.extension_end_date",
      note: "Extension end date recorded on the opportunity.",
      kind: "source",
      confidence: 0.84,
    });
  }
  if (input.contractEndDate) {
    facts.push({
      date: input.contractEndDate,
      field: "deals.contract_end_date",
      note: "Contract end date recorded on the opportunity.",
      kind: "source",
      confidence: 0.8,
    });
  }
  if (input.estimatedRenewalDate) {
    facts.push({
      date: input.estimatedRenewalDate,
      field: "deals.estimated_renewal_date",
      note: "Estimated renewal date recorded from the source notice.",
      kind: "source",
      confidence: 0.7,
    });
  }
  if (input.nextProcurementDate) {
    facts.push({
      date: input.nextProcurementDate,
      field: "deals.next_procurement_date",
      note: "Next procurement date recorded from the source notice.",
      kind: "source",
      confidence: 0.66,
    });
  }
  return facts;
}

export function insightRenewalFact(date: string | null): RenewalDateFact | null {
  if (!date) {
    return null;
  }
  return {
    date,
    field: "deal_insights.estimated_renewal_date",
    note: "DealAtlas inferred renewal date from stored analysis.",
    kind: "inference",
    confidence: 0.46,
  };
}
