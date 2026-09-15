import "server-only";

import { FEATURE_LIMITS, PLANS } from "@/lib/constants";
import { DatabaseQueryError, throwIfQueryError } from "@/lib/db/errors";
import { ExportQuotaError } from "@/lib/exports/errors";
import { remainingQuota } from "@/lib/quotas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseInput, uuidSchema } from "@/lib/validation";

export function utcBillingMonth(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export type ExportUsageSnapshot = {
  used: number;
  limit: number;
  remaining: number;
  billingMonth: string;
};

export async function loadExportUsageForMonth(
  userId: string,
  now: Date = new Date(),
): Promise<ExportUsageSnapshot> {
  const id = parseInput(uuidSchema, userId, "User id");
  const billingMonth = utcBillingMonth(now);
  const { data, error } = await createSupabaseAdminClient()
    .from("export_usage")
    .select("row_count")
    .eq("user_id", id)
    .eq("billing_month", billingMonth);

  const rows = throwIfQueryError("Failed to load export usage", {
    data: (data as { row_count: number }[] | null) ?? [],
    error,
  });
  const used = rows.reduce((sum, row) => sum + row.row_count, 0);
  const limit = FEATURE_LIMITS[PLANS.PRO].exportRowsPerMonth;
  return {
    used,
    limit,
    remaining: remainingQuota(used, limit) ?? 0,
    billingMonth,
  };
}

export async function recordExportUsage(input: {
  userId: string;
  rowCount: number;
  now?: Date;
}): Promise<void> {
  const id = parseInput(uuidSchema, input.userId, "User id");
  if (!Number.isInteger(input.rowCount) || input.rowCount <= 0) {
    throw new DatabaseQueryError("Export usage row count must be a positive integer");
  }

  const { error } = await createSupabaseAdminClient().from("export_usage").insert({
    user_id: id,
    export_type: "DEALS_CSV",
    row_count: input.rowCount,
    billing_month: utcBillingMonth(input.now),
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (
      message.includes("export row limit reached") ||
      message.includes("pro subscription required to export")
    ) {
      throw new ExportQuotaError();
    }
    throw new DatabaseQueryError("Failed to record export usage", error);
  }
}
