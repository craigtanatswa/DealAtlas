import "server-only";

import type { AdminAuditRow } from "@/lib/admin/types";
import type { Json } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const AUDIT_COLUMNS =
  "id, actor_id, action, entity_type, entity_id, summary, created_at";

export async function recordAdminAudit(input: {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("admin_audit_events")
    .insert({
      actor_id: input.actorId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary,
      metadata: (input.metadata ?? {}) as Json,
    });
  throwIfQueryError("Failed to record admin audit event", {
    data: true,
    error,
  });
}

export async function listAdminAuditEvents(limit = 20): Promise<AdminAuditRow[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from("admin_audit_events")
    .select(AUDIT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = throwIfQueryError("Failed to list admin audit events", {
    data: data ?? [],
    error,
  });
  return rows.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    createdAt: row.created_at,
  }));
}
