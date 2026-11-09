import type { CanonicalCandidate } from "@/ingestion/core/types";
import { parseMonthlyOcdsRaw } from "@/ingestion/sources/ocds-monthly/parse";
import { PUBLIC_CONTRACTS_SCOTLAND_MONTHLY_SOURCE } from "@/ingestion/sources/public-contracts-scotland/constants";

export function parsePublicContractsScotlandRaw(
  payload: unknown,
  now: Date,
): CanonicalCandidate[] {
  return parseMonthlyOcdsRaw(payload, now, PUBLIC_CONTRACTS_SCOTLAND_MONTHLY_SOURCE);
}
