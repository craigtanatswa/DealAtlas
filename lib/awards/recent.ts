import { BUYER_SECTOR_LABELS } from "@/lib/constants";
import { VALUE_BANDS } from "@/lib/preview/bands";
import { BROAD_REGIONS } from "@/lib/preview/region";

/** Fields a card may carry into HTML or the RSC payload. */
export const RECENT_AWARD_CARD_KEYS = ["sector", "region", "valueBand", "recencyWeeks"] as const;

/** Fields the rounded window aggregate may carry. */
export const RECENT_AWARD_AGGREGATE_KEYS = ["valueLabel", "contractCount", "windowWeeks"] as const;

export const RECENT_AWARD_RECENCY_WEEKS = [2, 4, 8] as const;

export type RecentAwardRecencyWeeks = (typeof RECENT_AWARD_RECENCY_WEEKS)[number];

export type RecentAwardCard = {
  sector: string;
  region: string;
  valueBand: string;
  recencyWeeks: RecentAwardRecencyWeeks;
};

export type RecentAwardAggregate = {
  valueLabel: string;
  contractCount: number;
  windowWeeks: RecentAwardRecencyWeeks;
};

export type RecentAwardStrip = {
  cards: RecentAwardCard[];
  aggregate: RecentAwardAggregate | null;
};

const SECTOR_LABELS = new Set<string>(Object.values(BUYER_SECTOR_LABELS));
const REGION_LABELS = new Set<string>(BROAD_REGIONS);
const VALUE_BAND_LABELS = new Set<string>(VALUE_BANDS);
const VALUE_LABEL = /^£(?:[1-9]\d{0,2}|[1-9]\.\d)(?:k|m)?$/;

const SAFE_NEXT_PATHS = new Set(["/", "/deals"]);

export function recentAwardRecencyLabel(weeks: RecentAwardRecencyWeeks): string {
  return `Awarded in the last ${weeks} weeks`;
}

export function recentAwardAggregateLine(aggregate: RecentAwardAggregate): string {
  return `${aggregate.valueLabel} awarded across ${aggregate.contractCount} contracts in the last ${aggregate.windowWeeks} weeks`;
}

export function recentAwardUpgradeHref(nextPath: string): string {
  const next = SAFE_NEXT_PATHS.has(nextPath) ? nextPath : "/";
  return `/pricing?plan=annual&next=${encodeURIComponent(next)}`;
}

/** Nearest 5 when the count is under 50. Counts under 10 are not shown. */
export function coarseContractCount(count: number): number | null {
  if (!Number.isInteger(count) || count < 10) {
    return null;
  }
  if (count >= 50) {
    return count;
  }
  return Math.round(count / 5) * 5;
}

function isRecencyWeeks(value: unknown): value is RecentAwardRecencyWeeks {
  return value === 2 || value === 4 || value === 8;
}

function parseCard(row: Record<string, unknown>): RecentAwardCard | null {
  const sector = row.sector;
  const region = row.region;
  const valueBand = row.value_band;
  const recencyWeeks = row.recency_weeks;
  if (typeof sector !== "string" || !SECTOR_LABELS.has(sector)) {
    return null;
  }
  if (typeof region !== "string" || !REGION_LABELS.has(region)) {
    return null;
  }
  if (typeof valueBand !== "string" || !VALUE_BAND_LABELS.has(valueBand)) {
    return null;
  }
  if (!isRecencyWeeks(recencyWeeks)) {
    return null;
  }

  return { sector, region, valueBand, recencyWeeks };
}

function parseAggregate(row: Record<string, unknown>): RecentAwardAggregate | null {
  const valueLabel = row.aggregate_value_label;
  const contractCount = row.aggregate_contract_count;
  const windowWeeks = row.aggregate_window_weeks;
  if (valueLabel == null && contractCount == null && windowWeeks == null) {
    return null;
  }
  if (typeof valueLabel !== "string" || !VALUE_LABEL.test(valueLabel)) {
    return null;
  }
  if (typeof contractCount !== "number" || !Number.isInteger(contractCount)) {
    return null;
  }
  const coarse = coarseContractCount(contractCount);
  if (coarse == null || !isRecencyWeeks(windowWeeks)) {
    return null;
  }

  return { valueLabel, contractCount: coarse, windowWeeks };
}

/**
 * Keep only the allowlisted card and aggregate fields. Extra keys, exact
 * values, ids and names on a row are dropped. Fewer than three qualifying
 * cards hides the strip.
 */
export function parseRecentAwardStrip(rows: unknown): RecentAwardStrip | null {
  if (!Array.isArray(rows)) {
    return null;
  }

  const cards: RecentAwardCard[] = [];
  const seen = new Set<string>();
  let aggregate: RecentAwardAggregate | null = null;

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const record = row as Record<string, unknown>;
    const card = parseCard(record);
    if (!card) {
      continue;
    }
    const pair = `${card.sector}\u0000${card.region}`;
    if (seen.has(pair)) {
      continue;
    }
    seen.add(pair);
    cards.push(card);
    if (!aggregate) {
      aggregate = parseAggregate(record);
    }
  }

  const visible = cards.slice(0, 6);
  if (visible.length < 3) {
    return null;
  }

  return { cards: visible, aggregate };
}
