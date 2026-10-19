import type { CanonicalCandidate } from "@/ingestion/core/types";
import { parseMonthlyOcdsRaw } from "@/ingestion/sources/ocds-monthly/parse";
import { SELL2WALES_MONTHLY_SOURCE } from "@/ingestion/sources/sell2wales/constants";

export function parseSell2WalesRaw(payload: unknown, now: Date): CanonicalCandidate[] {
  return parseMonthlyOcdsRaw(payload, now, SELL2WALES_MONTHLY_SOURCE);
}
