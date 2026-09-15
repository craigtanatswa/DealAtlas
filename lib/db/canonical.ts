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
  "is_sme",
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
  "incumbent_organization_id",
  "previous_contract_id",
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

const CANONICAL_DEAL_HISTORY_COLUMNS = [
  "id",
  "source_title",
  "buyer_organization_id",
  "deal_type",
  "buyer_sector",
  "stage",
  "status",
  "main_category",
  "currency",
  "value_min_ex_vat",
  "value_max_ex_vat",
  "award_decision_date",
  "contract_start_date",
  "contract_end_date",
  "extension_end_date",
  "next_procurement_date",
  "estimated_renewal_date",
  "first_published_at",
  "latest_source_at",
] as const;

const CANONICAL_AWARD_COLUMNS = [
  "id",
  "deal_id",
  "award_identifier",
  "award_date",
  "award_value",
  "currency",
  "number_of_tenders",
] as const;

const CANONICAL_AWARD_SUPPLIER_COLUMNS = [
  "award_id",
  "organization_id",
  "awarded_value",
] as const;

const CANONICAL_CONTRACT_COLUMNS = [
  "id",
  "deal_id",
  "award_id",
  "contract_identifier",
  "signed_date",
  "start_date",
  "end_date",
  "extension_end_date",
  "original_value",
  "current_value",
  "currency",
  "status",
] as const;

const CANONICAL_CONTRACT_PAYMENT_COLUMNS = [
  "id",
  "contract_id",
  "buyer_organization_id",
  "supplier_organization_id",
  "payment_date",
  "amount_net_vat",
  "currency",
] as const;

const CANONICAL_CONTRACT_PERFORMANCE_COLUMNS = [
  "id",
  "contract_id",
  "supplier_organization_id",
  "report_date",
  "kpi_name",
  "rating",
  "poor_performance",
  "breach_reported",
] as const;

const CANONICAL_DEAL_ORGANIZATION_COLUMNS = [
  "id",
  "deal_id",
  "organization_id",
  "role",
] as const;

const CANONICAL_RELATED_DEAL_COLUMNS = [
  "deal_id",
  "related_deal_id",
  "relationship_type",
  "confidence",
] as const;

const IN_CHUNK_SIZE = 80;

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
export type CanonicalDealHistory = Pick<
  Database["public"]["Tables"]["deals"]["Row"],
  (typeof CANONICAL_DEAL_HISTORY_COLUMNS)[number]
>;
export type CanonicalAward = Pick<
  Database["public"]["Tables"]["awards"]["Row"],
  (typeof CANONICAL_AWARD_COLUMNS)[number]
>;
export type CanonicalAwardSupplier = Pick<
  Database["public"]["Tables"]["award_suppliers"]["Row"],
  (typeof CANONICAL_AWARD_SUPPLIER_COLUMNS)[number]
>;
export type CanonicalContract = Pick<
  Database["public"]["Tables"]["contracts"]["Row"],
  (typeof CANONICAL_CONTRACT_COLUMNS)[number]
>;
export type CanonicalContractPayment = Pick<
  Database["public"]["Tables"]["contract_payments"]["Row"],
  (typeof CANONICAL_CONTRACT_PAYMENT_COLUMNS)[number]
>;
export type CanonicalContractPerformance = Pick<
  Database["public"]["Tables"]["contract_performance"]["Row"],
  (typeof CANONICAL_CONTRACT_PERFORMANCE_COLUMNS)[number]
>;
export type CanonicalDealOrganization = Pick<
  Database["public"]["Tables"]["deal_organizations"]["Row"],
  (typeof CANONICAL_DEAL_ORGANIZATION_COLUMNS)[number]
>;
export type CanonicalRelatedDeal = Pick<
  Database["public"]["Tables"]["related_deals"]["Row"],
  (typeof CANONICAL_RELATED_DEAL_COLUMNS)[number]
>;

function requireCanonicalAccess(access: CanonicalAccess): CanonicalAccess {
  return parseInput(canonicalAccessSchema, access, "Canonical access");
}

function adminClient() {
  return createSupabaseAdminClient();
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

async function mapInChunks<T>(
  ids: string[],
  loadChunk: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const unique = uniqueIds(ids);
  if (unique.length === 0) {
    return [];
  }
  const rows: T[] = [];
  for (let index = 0; index < unique.length; index += IN_CHUNK_SIZE) {
    const chunk = unique.slice(index, index + IN_CHUNK_SIZE);
    rows.push(...(await loadChunk(chunk)));
  }
  return rows;
}

function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
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

export async function listCanonicalDataSourcesByIds(
  sourceIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  return mapInChunks(sourceIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("data_sources")
      .select(CANONICAL_DATA_SOURCE_COLUMNS.join(", "))
      .in("id", chunk);
    return throwIfQueryError("Failed to load canonical data sources", {
      data: (data as unknown as CanonicalDataSource[]) ?? [],
      error,
    });
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

export async function listCanonicalOrganizationsByIds(
  organizationIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  return mapInChunks(organizationIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("organizations")
      .select(CANONICAL_ORGANIZATION_COLUMNS.join(", "))
      .in("id", chunk);
    return throwIfQueryError("Failed to load canonical organisations", {
      data: (data as unknown as CanonicalOrganization[]) ?? [],
      error,
    });
  });
}

export async function searchCanonicalOrganizationsByName(
  query: string,
  access: CanonicalAccess,
  options?: { limit?: number; offset?: number },
) {
  requireCanonicalAccess(access);
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  const trimmed = query.trim().slice(0, 80);
  let request = adminClient()
    .from("organizations")
    .select(CANONICAL_ORGANIZATION_COLUMNS.join(", "), { count: "exact" })
    .order("canonical_name", { ascending: true })
    .range(offset, offset + limit - 1);
  if (trimmed) {
    request = request.ilike("canonical_name", `%${escapeIlike(trimmed)}%`);
  }
  const { data, error, count } = await request;
  return throwIfQueryError("Failed to search canonical organisations", {
    data: {
      items: (data as unknown as CanonicalOrganization[]) ?? [],
      total: count ?? 0,
    },
    error,
  });
}

export async function listCanonicalDealsByBuyer(
  buyerOrganizationId: string,
  access: CanonicalAccess,
  options?: { limit?: number },
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, buyerOrganizationId, "Organization id");
  const { data, error } = await adminClient()
    .from("deals")
    .select(CANONICAL_DEAL_HISTORY_COLUMNS.join(", "))
    .eq("buyer_organization_id", id)
    .order("latest_source_at", { ascending: false })
    .limit(options?.limit ?? 200);

  return throwIfQueryError("Failed to load buyer deals", {
    data: (data as unknown as CanonicalDealHistory[]) ?? [],
    error,
  });
}

export async function listCanonicalDealsByIds(
  dealIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  return mapInChunks(dealIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("deals")
      .select(CANONICAL_DEAL_HISTORY_COLUMNS.join(", "))
      .in("id", chunk);
    return throwIfQueryError("Failed to load canonical deals", {
      data: (data as unknown as CanonicalDealHistory[]) ?? [],
      error,
    });
  });
}

export async function listCanonicalDealRecordsByIds(
  dealIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  return mapInChunks(dealIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("deals")
      .select(CANONICAL_DEAL_COLUMNS.join(", "))
      .in("id", chunk);
    return throwIfQueryError("Failed to load canonical deal records", {
      data: (data as unknown as CanonicalDeal[]) ?? [],
      error,
    });
  });
}

export async function listRecentCanonicalBuyerDealRefs(
  access: CanonicalAccess,
  options?: { limit?: number },
) {
  requireCanonicalAccess(access);
  const { data, error } = await adminClient()
    .from("deals")
    .select("buyer_organization_id, latest_source_at")
    .not("buyer_organization_id", "is", null)
    .order("latest_source_at", { ascending: false })
    .limit(options?.limit ?? 400);

  return throwIfQueryError("Failed to load recent buyer activity", {
    data:
      (data as unknown as Array<{
        buyer_organization_id: string | null;
        latest_source_at: string | null;
      }>) ?? [],
    error,
  });
}

export async function listCanonicalDealOrganizationsForOrganization(
  organizationId: string,
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, organizationId, "Organization id");
  const { data, error } = await adminClient()
    .from("deal_organizations")
    .select(CANONICAL_DEAL_ORGANIZATION_COLUMNS.join(", "))
    .eq("organization_id", id)
    .limit(400);

  return throwIfQueryError("Failed to load organisation deal roles", {
    data: (data as unknown as CanonicalDealOrganization[]) ?? [],
    error,
  });
}

export async function listCanonicalDealOrganizationsForDeals(
  dealIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  return mapInChunks(dealIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("deal_organizations")
      .select(CANONICAL_DEAL_ORGANIZATION_COLUMNS.join(", "))
      .in("deal_id", chunk);
    return throwIfQueryError("Failed to load deal organisations", {
      data: (data as unknown as CanonicalDealOrganization[]) ?? [],
      error,
    });
  });
}

export async function listCanonicalAwardsByIds(
  awardIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  return mapInChunks(awardIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("awards")
      .select(CANONICAL_AWARD_COLUMNS.join(", "))
      .in("id", chunk);
    return throwIfQueryError("Failed to load awards by id", {
      data: (data as unknown as CanonicalAward[]) ?? [],
      error,
    });
  });
}

export async function listCanonicalAwardsForDeals(
  dealIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  return mapInChunks(dealIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("awards")
      .select(CANONICAL_AWARD_COLUMNS.join(", "))
      .in("deal_id", chunk)
      .order("award_date", { ascending: false });
    return throwIfQueryError("Failed to load awards", {
      data: (data as unknown as CanonicalAward[]) ?? [],
      error,
    });
  });
}

export async function listCanonicalAwardSuppliers(
  awardIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  return mapInChunks(awardIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("award_suppliers")
      .select(CANONICAL_AWARD_SUPPLIER_COLUMNS.join(", "))
      .in("award_id", chunk);
    return throwIfQueryError("Failed to load award suppliers", {
      data: (data as unknown as CanonicalAwardSupplier[]) ?? [],
      error,
    });
  });
}

export async function listCanonicalAwardSuppliersForOrganization(
  organizationId: string,
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const id = parseInput(uuidSchema, organizationId, "Organization id");
  const { data, error } = await adminClient()
    .from("award_suppliers")
    .select(CANONICAL_AWARD_SUPPLIER_COLUMNS.join(", "))
    .eq("organization_id", id)
    .limit(400);

  return throwIfQueryError("Failed to load organisation awards", {
    data: (data as unknown as CanonicalAwardSupplier[]) ?? [],
    error,
  });
}

export async function listRecentCanonicalAwardSupplierRefs(
  access: CanonicalAccess,
  options?: { limit?: number },
) {
  requireCanonicalAccess(access);
  const { data, error } = await adminClient()
    .from("award_suppliers")
    .select("organization_id, created_at")
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 400);

  return throwIfQueryError("Failed to load recent award suppliers", {
    data:
      (data as unknown as Array<{
        organization_id: string;
        created_at: string;
      }>) ?? [],
    error,
  });
}

export async function listCanonicalContractsForDeals(
  dealIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  return mapInChunks(dealIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("contracts")
      .select(CANONICAL_CONTRACT_COLUMNS.join(", "))
      .in("deal_id", chunk)
      .order("end_date", { ascending: false });
    return throwIfQueryError("Failed to load contracts", {
      data: (data as unknown as CanonicalContract[]) ?? [],
      error,
    });
  });
}

export async function listCanonicalContractsPage(
  access: CanonicalAccess,
  options?: { limit?: number; offset?: number },
) {
  requireCanonicalAccess(access);
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  const { data, error, count } = await adminClient()
    .from("contracts")
    .select(CANONICAL_CONTRACT_COLUMNS.join(", "), { count: "exact" })
    .order("end_date", { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  return throwIfQueryError("Failed to list contracts", {
    data: {
      items: (data as unknown as CanonicalContract[]) ?? [],
      total: count ?? 0,
    },
    error,
  });
}

export async function listCanonicalContractsInDateWindow(
  access: CanonicalAccess,
  options: { from: string; to: string; limit?: number },
) {
  requireCanonicalAccess(access);
  const limit = options.limit ?? 200;
  const [byEnd, byExtension] = await Promise.all([
    adminClient()
      .from("contracts")
      .select(CANONICAL_CONTRACT_COLUMNS.join(", "))
      .gte("end_date", options.from)
      .lte("end_date", options.to)
      .limit(limit),
    adminClient()
      .from("contracts")
      .select(CANONICAL_CONTRACT_COLUMNS.join(", "))
      .gte("extension_end_date", options.from)
      .lte("extension_end_date", options.to)
      .limit(limit),
  ]);
  const endRows = throwIfQueryError("Failed to load expiring contracts", {
    data: (byEnd.data as unknown as CanonicalContract[]) ?? [],
    error: byEnd.error,
  });
  const extensionRows = throwIfQueryError("Failed to load extending contracts", {
    data: (byExtension.data as unknown as CanonicalContract[]) ?? [],
    error: byExtension.error,
  });
  const byId = new Map<string, CanonicalContract>();
  for (const row of [...endRows, ...extensionRows]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

export async function listCanonicalContractPayments(
  contractIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  return mapInChunks(contractIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("contract_payments")
      .select(CANONICAL_CONTRACT_PAYMENT_COLUMNS.join(", "))
      .in("contract_id", chunk)
      .order("payment_date", { ascending: false });
    return throwIfQueryError("Failed to load contract payments", {
      data: (data as unknown as CanonicalContractPayment[]) ?? [],
      error,
    });
  });
}

export async function listCanonicalContractPerformance(
  contractIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  return mapInChunks(contractIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("contract_performance")
      .select(CANONICAL_CONTRACT_PERFORMANCE_COLUMNS.join(", "))
      .in("contract_id", chunk)
      .order("report_date", { ascending: false });
    return throwIfQueryError("Failed to load contract performance", {
      data: (data as unknown as CanonicalContractPerformance[]) ?? [],
      error,
    });
  });
}

export async function listCanonicalRelatedDeals(
  dealIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  const outgoing = await mapInChunks(dealIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("related_deals")
      .select(CANONICAL_RELATED_DEAL_COLUMNS.join(", "))
      .in("deal_id", chunk);
    return throwIfQueryError("Failed to load related deals", {
      data: (data as unknown as CanonicalRelatedDeal[]) ?? [],
      error,
    });
  });
  const incoming = await mapInChunks(dealIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("related_deals")
      .select(CANONICAL_RELATED_DEAL_COLUMNS.join(", "))
      .in("related_deal_id", chunk);
    return throwIfQueryError("Failed to load incoming related deals", {
      data: (data as unknown as CanonicalRelatedDeal[]) ?? [],
      error,
    });
  });
  const seen = new Set<string>();
  const rows: CanonicalRelatedDeal[] = [];
  for (const row of [...outgoing, ...incoming]) {
    const key = `${row.deal_id}:${row.related_deal_id}:${row.relationship_type}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

export async function listCanonicalDealsInRenewalWindow(
  access: CanonicalAccess,
  options: { from: string; to: string; limit?: number },
) {
  requireCanonicalAccess(access);
  const limit = options.limit ?? 200;
  const [byEstimated, byNext, byEnd, byType] = await Promise.all([
    adminClient()
      .from("deals")
      .select(CANONICAL_DEAL_HISTORY_COLUMNS.join(", "))
      .gte("estimated_renewal_date", options.from)
      .lte("estimated_renewal_date", options.to)
      .limit(limit),
    adminClient()
      .from("deals")
      .select(CANONICAL_DEAL_HISTORY_COLUMNS.join(", "))
      .gte("next_procurement_date", options.from)
      .lte("next_procurement_date", options.to)
      .limit(limit),
    adminClient()
      .from("deals")
      .select(CANONICAL_DEAL_HISTORY_COLUMNS.join(", "))
      .gte("contract_end_date", options.from)
      .lte("contract_end_date", options.to)
      .limit(limit),
    adminClient()
      .from("deals")
      .select(CANONICAL_DEAL_HISTORY_COLUMNS.join(", "))
      .eq("deal_type", "CONTRACT_RENEWAL")
      .in("status", ["OPEN", "UPCOMING", "CLOSING_SOON"])
      .limit(limit),
  ]);

  const rows = [
    ...throwIfQueryError("Failed to load estimated renewals", {
      data: (byEstimated.data as unknown as CanonicalDealHistory[]) ?? [],
      error: byEstimated.error,
    }),
    ...throwIfQueryError("Failed to load next procurement dates", {
      data: (byNext.data as unknown as CanonicalDealHistory[]) ?? [],
      error: byNext.error,
    }),
    ...throwIfQueryError("Failed to load deal contract ends", {
      data: (byEnd.data as unknown as CanonicalDealHistory[]) ?? [],
      error: byEnd.error,
    }),
    ...throwIfQueryError("Failed to load renewal notices", {
      data: (byType.data as unknown as CanonicalDealHistory[]) ?? [],
      error: byType.error,
    }),
  ];
  const byId = new Map<string, CanonicalDealHistory>();
  for (const row of rows) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

export async function listCanonicalInsightsInRenewalWindow(
  access: CanonicalAccess,
  options: { from: string; to: string; limit?: number },
) {
  requireCanonicalAccess(access);
  const { data, error } = await adminClient()
    .from("deal_insights")
    .select(CANONICAL_INSIGHT_COLUMNS.join(", "))
    .gte("estimated_renewal_date", options.from)
    .lte("estimated_renewal_date", options.to)
    .limit(options.limit ?? 200);

  return throwIfQueryError("Failed to load renewal insights", {
    data: (data as unknown as CanonicalInsight[]) ?? [],
    error,
  });
}

export async function listCanonicalInsightsForDeals(
  dealIds: string[],
  access: CanonicalAccess,
) {
  requireCanonicalAccess(access);
  return mapInChunks(dealIds, async (chunk) => {
    const { data, error } = await adminClient()
      .from("deal_insights")
      .select(CANONICAL_INSIGHT_COLUMNS.join(", "))
      .in("deal_id", chunk);
    return throwIfQueryError("Failed to load deal insights", {
      data: (data as unknown as CanonicalInsight[]) ?? [],
      error,
    });
  });
}
