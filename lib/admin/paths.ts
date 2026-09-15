import { uuidSchema } from "@/lib/validation";

export const ADMIN_PAGE_SIZE = 25;
export const ADMIN_STALE_AFTER_DAYS = 14;
export const ADMIN_INGEST_LIMIT = 5;

export function adminDealPath(dealId: string): string {
  return `/admin/deals/${dealId}`;
}

export function adminSourcePath(sourceId: string): string {
  return `/admin/sources/${sourceId}`;
}

export function adminOrganisationPath(organizationId: string): string {
  return `/admin/organisations/${organizationId}`;
}

export function adminIngestionRunPath(runId: string): string {
  return `/admin/ingestion/runs/${runId}`;
}

export function adminRawRecordPath(rawRecordId: string): string {
  return `/admin/ingestion/raw/${rawRecordId}`;
}

export function parseAdminIdParam(value: unknown): string | null {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function firstSearchParam(
  value: string | string[] | undefined,
): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function parseAdminPage(value: string | string[] | undefined): number {
  const parsed = Number(firstSearchParam(value) || "1");
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.floor(parsed);
}
