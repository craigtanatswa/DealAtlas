import type {
  CategoryActivity,
  IntelligenceDealRef,
  YearActivity,
} from "@/lib/intelligence/types";

function statedValue(deal: IntelligenceDealRef): number | null {
  return deal.valueMaxExVat ?? deal.valueMinExVat ?? null;
}

function activityYear(deal: IntelligenceDealRef): string | null {
  const stamp =
    deal.awardDecisionDate ??
    deal.contractStartDate ??
    deal.firstPublishedAt;
  if (!stamp) {
    return null;
  }
  const year = stamp.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

export function aggregateCategoryActivity(deals: IntelligenceDealRef[]): CategoryActivity[] {
  const groups = new Map<string, CategoryActivity>();
  for (const deal of deals) {
    const category = deal.mainCategory?.trim() || "Uncategorised";
    const current = groups.get(category) ?? {
      category,
      dealCount: 0,
      statedValueSum: null,
      currency: deal.currency,
      dealsMissingValue: 0,
    };
    current.dealCount += 1;
    const value = statedValue(deal);
    if (value == null) {
      current.dealsMissingValue += 1;
    } else {
      current.statedValueSum = (current.statedValueSum ?? 0) + value;
      current.currency = current.currency ?? deal.currency;
    }
    groups.set(category, current);
  }
  return [...groups.values()].sort((left, right) => right.dealCount - left.dealCount);
}

export function aggregateYearActivity(deals: IntelligenceDealRef[]): YearActivity[] {
  const groups = new Map<string, YearActivity>();
  for (const deal of deals) {
    const year = activityYear(deal);
    if (!year) {
      continue;
    }
    const current = groups.get(year) ?? {
      year,
      dealCount: 0,
      statedValueSum: null,
      currency: deal.currency,
    };
    current.dealCount += 1;
    const value = statedValue(deal);
    if (value != null) {
      current.statedValueSum = (current.statedValueSum ?? 0) + value;
      current.currency = current.currency ?? deal.currency;
    }
    groups.set(year, current);
  }
  return [...groups.values()].sort((left, right) => right.year.localeCompare(left.year));
}
