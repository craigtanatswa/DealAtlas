import "server-only";

import { z } from "zod";

import type { Database } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseInput, uuidSchema } from "@/lib/validation";
import { toAlertCentreDto } from "@/lib/alerts/dto";
import type { AlertCentreDto, AlertRecord, AlertStatus } from "@/lib/alerts/types";
import { ALERT_STATUSES } from "@/lib/alerts/types";
import { getCurrentEntitlement } from "@/lib/entitlements/service";

const ALERT_SELECT =
  "id, user_id, deal_id, alert_type, status, title, message, protected_payload, created_at, read_at, sent_at";

export async function listAlertCentre(input: {
  userId: string;
  limit?: number;
}): Promise<AlertCentreDto> {
  const userId = parseInput(uuidSchema, input.userId, "User id");
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const admin = createSupabaseAdminClient();
  const entitlement = await getCurrentEntitlement(userId);
  const { data, error } = await admin
    .from("alerts")
    .select(ALERT_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = throwIfQueryError("Failed to load alerts", {
    data: ((data as AlertRecord[] | null) ?? []).map((row) => ({
      ...row,
      dedupe_key: row.dedupe_key ?? "",
    })),
    error,
  });
  return toAlertCentreDto(rows, entitlement);
}

export async function markAlertStatus(input: {
  userId: string;
  alertId: string;
  status: AlertStatus;
}): Promise<void> {
  const userId = parseInput(uuidSchema, input.userId, "User id");
  const alertId = parseInput(uuidSchema, input.alertId, "Alert id");
  const status = parseInput(z.enum(ALERT_STATUSES), input.status, "Alert status");
  const admin = createSupabaseAdminClient();
  const patch: Database["public"]["Tables"]["alerts"]["Update"] = {
    status,
    read_at:
      status === "READ" || status === "DISMISSED" ? new Date().toISOString() : null,
  };
  const { data, error } = await admin
    .from("alerts")
    .update(patch)
    .eq("id", alertId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  throwIfQueryError("Failed to update alert", {
    data: data ?? true,
    error,
  });
}
