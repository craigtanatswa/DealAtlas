import type { PaidDealDto } from "@/lib/deals/paid-dto";
import { isProEntitlement } from "@/lib/entitlements/policy";
import type {
  EntitlementSnapshot,
  ProCanonicalAccess,
} from "@/lib/entitlements/types";
import {
  DEAL_EXPORT_COLUMNS,
  assertDealExportRow,
  exportRowCells,
  paidDealToExportRow,
} from "@/lib/exports/columns";
import { buildUtf8Csv } from "@/lib/exports/csv";
import { EXPORT_ERROR, ExportQuotaError } from "@/lib/exports/errors";
import { dealExportFilename } from "@/lib/exports/filename";
import {
  parseDealExportRequest,
  type DealExportRequest,
} from "@/lib/exports/request";
import { uuidSchema } from "@/lib/validation";

export { EXPORT_ERROR, ExportQuotaError };

export type DealExportIdResolver = (input: {
  userId: string;
  body: DealExportRequest;
  remaining: number;
}) => Promise<string[]>;

export type DealExportLoader = (
  dealIds: string[],
  access: ProCanonicalAccess,
) => Promise<PaidDealDto[]>;

export type DealExportUsageRecorder = (input: {
  userId: string;
  rowCount: number;
}) => Promise<void>;

export type DealExportRequestInput = {
  userId: string | null;
  entitlement: EntitlementSnapshot | null;
  remaining: number;
  /**
   * Client-supplied plan labels. Ignored.
   * Present so tests can prove tampering does not grant Pro.
   */
  clientClaimedPlan?: unknown;
  body: unknown;
  resolveDealIds: DealExportIdResolver;
  loadPaidDeals: DealExportLoader;
  recordUsage: DealExportUsageRecorder;
  now?: Date;
};

export type DealExportSuccess = {
  status: 200;
  filename: string;
  csv: string;
  rowCount: number;
};

export type DealExportFailure = {
  status: 400 | 401 | 403;
  body: { error: string; code: string };
};

export type DealExportResponse = DealExportSuccess | DealExportFailure;

function failure(
  status: 400 | 401 | 403,
  code: string,
  error: string,
): DealExportFailure {
  return { status, body: { error, code } };
}

/**
 * Pro CSV export gate. Entitlement is checked before canonical reads.
 * Quota is checked before ID resolution and paid-field loading so over-limit
 * requests never generate a large CSV.
 */
export async function fulfillDealExportRequest(
  input: DealExportRequestInput,
): Promise<DealExportResponse> {
  void input.clientClaimedPlan;

  const parsed = parseDealExportRequest(input.body);
  if (!parsed) {
    return failure(400, "INVALID_INPUT", EXPORT_ERROR.INVALID_INPUT);
  }

  const userIdResult = uuidSchema.safeParse(input.userId);
  if (!userIdResult.success) {
    return failure(401, "UNAUTHENTICATED", EXPORT_ERROR.UNAUTHENTICATED);
  }

  if (!isProEntitlement(input.entitlement)) {
    return failure(403, "FORBIDDEN", EXPORT_ERROR.FORBIDDEN);
  }

  const remaining = Math.max(0, Math.floor(input.remaining));
  if (remaining <= 0) {
    return failure(403, "EXPORT_LIMIT", EXPORT_ERROR.LIMIT);
  }

  if (parsed.dealIds && parsed.dealIds.length > remaining) {
    return failure(403, "EXPORT_LIMIT", EXPORT_ERROR.TOO_LARGE);
  }

  const userId = userIdResult.data;
  const dealIds = await input.resolveDealIds({
    userId,
    body: parsed,
    remaining,
  });
  const cappedIds = dealIds.slice(0, remaining);
  if (cappedIds.length === 0) {
    return failure(400, "EMPTY_EXPORT", EXPORT_ERROR.EMPTY);
  }

  const access: ProCanonicalAccess = { kind: "pro", userId };
  const deals = await input.loadPaidDeals(cappedIds, access);
  if (deals.length === 0) {
    return failure(400, "EMPTY_EXPORT", EXPORT_ERROR.EMPTY);
  }
  if (deals.length > remaining) {
    return failure(403, "EXPORT_LIMIT", EXPORT_ERROR.TOO_LARGE);
  }

  try {
    await input.recordUsage({ userId, rowCount: deals.length });
  } catch (error) {
    if (error instanceof ExportQuotaError) {
      return failure(403, "EXPORT_LIMIT", EXPORT_ERROR.LIMIT);
    }
    throw error;
  }

  const rows = deals.map((deal) =>
    exportRowCells(assertDealExportRow(paidDealToExportRow(deal))),
  );
  const csv = buildUtf8Csv(
    DEAL_EXPORT_COLUMNS.map((column) => column.header),
    rows,
  );

  return {
    status: 200,
    filename: dealExportFilename(input.now),
    csv,
    rowCount: deals.length,
  };
}
