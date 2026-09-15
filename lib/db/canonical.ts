import "server-only";

import { z } from "zod";

import type { Database } from "@/lib/db/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { throwIfQueryError } from "@/lib/db/errors";
import { parseInput, uuidSchema } from "@/lib/validation";

const canonicalAccessSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pro"),
    userId: uuidSchema,
  }),
  z.object({
    kind: z.literal("admin"),
    userId: uuidSchema,
  }),
]);

export type CanonicalAccess = z.infer<typeof canonicalAccessSchema>;

const CANONICAL_DEAL_COLUMNS = [
  "id",
  "primary_source_id",
  "external_primary_id",
  "ocid",
  "reference",
  "source_title",
  "source_description",
  "buyer_organization_id",
  "deal_type",
  "buyer_sector",
  "stage",
  "status",
  "main_category",
  "procurement_method",
  "special_regime",
  "currency",
  "value_min_ex_vat",
  "value_max_ex_vat",
  "exact_value_text",
  "exact_location_text",
  "enquiry_deadline",
  "submission_deadline",
  "award_decision_date",
  "contract_start_date",
  "contract_end_date",
  "extension_end_date",
  "next_procurement_date",
  "estimated_renewal_date",
  "sme_suitable",
  "vcse_suitable",
  "source_url",
  "application_url",
  "first_published_at",
  "latest_source_at",
  "first_discovered_at",
  "last_verified_at",
  "data_quality_score",
  "source_count",
  "created_at",
  "updated_at",
] as const;

const CANONICAL_ORGANIZATION_COLUMNS = [
  "id",
  "canonical_name",
  "normalized_name",
  "buyer_sector",
  "website",
  "domain",
  "email",
  "phone",
  "city",
  "region",
  "country_code",
  "created_at",
  "updated_at",
] as const;

const CANONICAL_NOTICE_COLUMNS = [
  "id",
  "deal_id",
  "source_id",
  "notice_identifier",
  "release_id",
  "notice_type",
  "notice_stage",
  "source_url",
  "published_at",
  "modified_at",
  "is_current_version",
  "created_at",
] as const;

const CANONICAL_DOCUMENT_COLUMNS = [
  "id",
  "deal_id",
  "notice_id",
  "lot_id",
  "source_id",
  "name",
  "document_type",
  "source_url",
  "mime_type",
  "published_at",
  "redistribution_permitted",
  "processing_status",
  "created_at",
  "updated_at",
] as const;

const CANONICAL_DATA_SOURCE_COLUMNS = [
  "id",
  "source_key",
  "name",
  "source_type",
  "access_method",
  "base_url",
  "reuse_status",
  "licence_name",
  "licence_url",
  "terms_url",
  "scraping_permitted",
  "enabled",
  "created_at",
  "updated_at",
] as const;

const CANONICAL_LOT_COLUMNS = [
  "id",
  "deal_id",
  "lot_number",
  "source_title",
  "source_description",
  "status",
  "currency",
  "value_min",
  "value_max",
  "exact_location_text",
  "submission_deadline",
  "contract_start_date",
  "contract_end_date",
  "sme_suitable",
  "vcse_suitable",
] as const;

const CANONICAL_REQUIREMENT_COLUMNS = [
  "id",
  "deal_id",
  "lot_id",
  "requirement_type",
  "name",
  "description",
  "mandatory",
  "minimum_value",
  "unit",
  "evidence_required",
  "is_inferred",
] as const;

const CANONICAL_AWARD_CRITERION_COLUMNS = [
  "id",
  "deal_id",
  "lot_id",
  "criterion_name",
  "criterion_description",
  "criterion_type",
  "weight_percent",
  "order_of_importance",
] as const;

const CANONICAL_INSIGHT_COLUMNS = [
  "deal_id",
  "summary",
  "buyer_need",
  "ideal_supplier",
  "key_deliverables",
  "mandatory_requirements",
  "competition_notes",
  "sme_accessibility",
  "bid_complexity",
  "competition_level",
  "deadline_urgency",
  "risk_flags",
  "estimated_renewal_date",
  "confidence",
  "generation_method",
  "model_version",
  "field_provenance",
  "generated_at",
] as const;

const CANONICAL_CHANGE_COLUMNS = [
  "id",
  "deal_id",
  "change_type",
  "field_name",
  "occurred_at",
  "material",
] as const;

export type CanonicalDeal = Pick<
  Database["public"]["Tables"]["deals"]["Row"],
  (typeof CANONICAL_DEAL_COLUMNS)[number]
>;
export type CanonicalOrganization = Pick<
  Database["public"]["Tables"]["organizations"]["Row"],
  (typeof CANONICAL_ORGANIZATION_COLUMNS)[number]
>;
export type CanonicalNotice = Pick<
  Database["public"]["Tables"]["notices"]["Row"],
  (typeof CANONICAL_NOTICE_COLUMNS)[number]
>;
export type CanonicalDocument = Pick<
  Database["public"]["Tables"]["documents"]["Row"],
  (typeof CANONICAL_DOCUMENT_COLUMNS)[number]
>;
export type CanonicalDataSource = Pick<
  Database["public"]["Tables"]["data_sources"]["Row"],
  (typeof CANONICAL_DATA_SOURCE_COLUMNS)[number]
>;
export type CanonicalLot = Pick<
  Database["public"]["Tables"]["lots"]["Row"],
  (typeof CANONICAL_LOT_COLUMNS)[number]
>;
export type CanonicalRequirement = Pick<
  Database["public"]["Tables"]["requirements"]["Row"],
  (typeof CANONICAL_REQUIREMENT_COLUMNS)[number]
>;
export type CanonicalAwardCriterion = Pick<
  Database["public"]["Tables"]["award_criteria"]["Row"],
  (typeof CANONICAL_AWARD_CRITERION_COLUMNS)[number]
>;
export type CanonicalChange = Pick<
  Database["public"]["Tables"]["data_changes"]["Row"],
  (typeof CANONICAL_CHANGE_COLUMNS)[number]
>;
export type CanonicalInsight = Pick<
  Database["public"]["Tables"]["deal_insights"]["Row"],
  (typeof CANONICAL_INSIGHT_COLUMNS)[number]
>;

function requireCanonicalAccess(access: CanonicalAccess): CanonicalAccess {
  return parseInput(canonicalAccessSchema, access, "Canonical access");
}

function adminClient() {
  return createSupabaseAdminClient();
}

export async function getCanonicalDealById(
  dealId: string,
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, dealId, "Deal id");
  const { data, error } = await adminClient()
    .from("deals")
    .select(CANONICAL_DEAL_COLUMNS.join(", "))
    .eq("id", id)
    .maybeSingle();

  return throwIfQueryError("Failed to load canonical deal", {
    data: (data as unknown as CanonicalDeal | null) ?? null,
    error,
  });
}

export async function getCanonicalOrganizationById(
  organizationId: string,
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, organizationId, "Organization id");
  const { data, error } = await adminClient()
    .from("organizations")
    .select(CANONICAL_ORGANIZATION_COLUMNS.join(", "))
    .eq("id", id)
    .maybeSingle();

  return throwIfQueryError("Failed to load canonical organization", {
    data: (data as unknown as CanonicalOrganization | null) ?? null,
    error,
  });
}

export async function listCanonicalNoticesForDeal(
  dealId: string,
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, dealId, "Deal id");
  const { data, error } = await adminClient()
    .from("notices")
    .select(CANONICAL_NOTICE_COLUMNS.join(", "))
    .eq("deal_id", id)
    .order("published_at", { ascending: false });

  return throwIfQueryError("Failed to load canonical notices", {
    data: (data as unknown as CanonicalNotice[]) ?? [],
    error,
  });
}

export async function listCanonicalDocumentsForDeal(
  dealId: string,
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, dealId, "Deal id");
  const { data, error } = await adminClient()
    .from("documents")
    .select(CANONICAL_DOCUMENT_COLUMNS.join(", "))
    .eq("deal_id", id)
    .order("published_at", { ascending: false });

  return throwIfQueryError("Failed to load canonical documents", {
    data: (data as unknown as CanonicalDocument[]) ?? [],
    error,
  });
}

export async function getCanonicalDataSourceById(
  sourceId: string,
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, sourceId, "Data source id");
  const { data, error } = await adminClient()
    .from("data_sources")
    .select(CANONICAL_DATA_SOURCE_COLUMNS.join(", "))
    .eq("id", id)
    .maybeSingle();

  return throwIfQueryError("Failed to load canonical data source", {
    data: (data as unknown as CanonicalDataSource | null) ?? null,
    error,
  });
}

export async function listCanonicalLotsForDeal(
  dealId: string,
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, dealId, "Deal id");
  const { data, error } = await adminClient()
    .from("lots")
    .select(CANONICAL_LOT_COLUMNS.join(", "))
    .eq("deal_id", id)
    .order("lot_number", { ascending: true });

  return throwIfQueryError("Failed to load canonical lots", {
    data: (data as unknown as CanonicalLot[]) ?? [],
    error,
  });
}

export async function listCanonicalRequirementsForDeal(
  dealId: string,
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, dealId, "Deal id");
  const { data, error } = await adminClient()
    .from("requirements")
    .select(CANONICAL_REQUIREMENT_COLUMNS.join(", "))
    .eq("deal_id", id)
    .order("created_at", { ascending: true });

  return throwIfQueryError("Failed to load canonical requirements", {
    data: (data as unknown as CanonicalRequirement[]) ?? [],
    error,
  });
}

export async function listCanonicalAwardCriteriaForDeal(
  dealId: string,
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, dealId, "Deal id");
  const { data, error } = await adminClient()
    .from("award_criteria")
    .select(CANONICAL_AWARD_CRITERION_COLUMNS.join(", "))
    .eq("deal_id", id)
    .order("order_of_importance", { ascending: true });

  return throwIfQueryError("Failed to load canonical award criteria", {
    data: (data as unknown as CanonicalAwardCriterion[]) ?? [],
    error,
  });
}

export async function listCanonicalChangesForDeal(
  dealId: string,
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, dealId, "Deal id");
  const { data, error } = await adminClient()
    .from("data_changes")
    .select(CANONICAL_CHANGE_COLUMNS.join(", "))
    .eq("deal_id", id)
    .order("occurred_at", { ascending: true });

  return throwIfQueryError("Failed to load canonical deal changes", {
    data: (data as unknown as CanonicalChange[]) ?? [],
    error,
  });
}

export async function getCanonicalDealInsights(
  dealId: string,
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, dealId, "Deal id");
  const { data, error } = await adminClient()
    .from("deal_insights")
    .select(CANONICAL_INSIGHT_COLUMNS.join(", "))
    .eq("deal_id", id)
    .maybeSingle();

  return throwIfQueryError("Failed to load canonical deal insights", {
    data: (data as unknown as CanonicalInsight | null) ?? null,
    error,
  });
}
