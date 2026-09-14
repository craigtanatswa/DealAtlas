import { DatabaseQueryError, throwIfQueryError } from "@/lib/db/errors";
import type { Database, Json } from "@/lib/db/database.types";

import { normalizeTitle } from "@/ingestion/normalizers/text";
import type {
  AwardRecord,
  ContractRecord,
  DataSourceRecord,
  DealRecord,
  IngestionRunRecord,
  IngestionStore,
  LotRecord,
  NoticeRecord,
  NoticeVersionRecord,
  OrganizationRecord,
  RawRecordRow,
} from "@/ingestion/store/types";
import type { IngestionSupabaseClient } from "@/ingestion/store/worker-client";

type SourceRow = Database["public"]["Tables"]["data_sources"]["Row"];
type DealRow = Database["public"]["Tables"]["deals"]["Row"];
type OrgRow = Database["public"]["Tables"]["organizations"]["Row"];
type NoticeRow = Database["public"]["Tables"]["notices"]["Row"];
type LotRow = Database["public"]["Tables"]["lots"]["Row"];
type AwardRow = Database["public"]["Tables"]["awards"]["Row"];
type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];

function requireRow<T>(
  label: string,
  result: {
    data: T | null;
    error: { message: string; code?: string; details?: string } | null;
  },
): T {
  const data = throwIfQueryError(label, result);
  if (data == null) {
    throw new DatabaseQueryError(`${label}: no row returned`);
  }
  return data;
}

function asJson(value: Record<string, unknown> | undefined): Json | undefined {
  return value as Json | undefined;
}

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapSource(row: SourceRow): DataSourceRecord {
  return {
    id: row.id,
    sourceKey: row.source_key,
    name: row.name,
    sourceType: row.source_type,
    accessMethod: row.access_method,
    baseUrl: row.base_url,
    apiUrl: row.api_url,
    termsUrl: row.terms_url,
    licenceName: row.licence_name,
    licenceUrl: row.licence_url,
    reuseStatus: row.reuse_status,
    scrapingPermitted: row.scraping_permitted,
    enabled: row.enabled,
    scheduleExpression: row.schedule_expression,
    rateLimitPerMinute: row.rate_limit_per_minute,
    robotsCheckedAt: row.robots_checked_at,
    termsCheckedAt: row.terms_checked_at,
    complianceNotes: row.compliance_notes,
    lastSuccessAt: row.last_success_at,
    consecutiveFailures: row.consecutive_failures,
  };
}

function mapOrg(row: OrgRow): OrganizationRecord {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    normalizedName: row.normalized_name,
    buyerSector: row.buyer_sector,
    website: row.website,
    domain: row.domain,
    email: row.email,
    phone: row.phone,
    addressLine1: row.address_line_1,
    city: row.city,
    region: row.region,
    postcode: row.postcode,
    countryCode: row.country_code,
    isSme: row.is_sme,
    isVcse: row.is_vcse,
  };
}

function mapDeal(row: DealRow): DealRecord {
  return {
    id: row.id,
    primarySourceId: row.primary_source_id,
    externalPrimaryId: row.external_primary_id,
    ocid: row.ocid,
    reference: row.reference,
    sourceTitle: row.source_title,
    sourceDescription: row.source_description,
    buyerOrganizationId: row.buyer_organization_id,
    dealType: row.deal_type,
    buyerSector: row.buyer_sector,
    stage: row.stage,
    status: row.status,
    mainCategory: row.main_category,
    procurementMethod: row.procurement_method,
    specialRegime: row.special_regime,
    currency: row.currency,
    valueMinExVat: asNumber(row.value_min_ex_vat),
    valueMaxExVat: asNumber(row.value_max_ex_vat),
    exactValueText: row.exact_value_text,
    exactLocationText: row.exact_location_text,
    enquiryDeadline: row.enquiry_deadline,
    submissionDeadline: row.submission_deadline,
    awardDecisionDate: row.award_decision_date,
    contractStartDate: row.contract_start_date,
    contractEndDate: row.contract_end_date,
    extensionEndDate: row.extension_end_date,
    nextProcurementDate: row.next_procurement_date,
    estimatedRenewalDate: row.estimated_renewal_date,
    smeSuitable: row.sme_suitable,
    vcseSuitable: row.vcse_suitable,
    sourceUrl: row.source_url,
    applicationUrl: row.application_url,
    firstPublishedAt: row.first_published_at,
    latestSourceAt: row.latest_source_at,
    firstDiscoveredAt: row.first_discovered_at,
    lastVerifiedAt: row.last_verified_at,
    dataQualityScore: row.data_quality_score,
    sourceCount: row.source_count,
    normalizedTitle: normalizeTitle(row.source_title),
  };
}

function mapNotice(row: NoticeRow): NoticeRecord {
  return {
    id: row.id,
    dealId: row.deal_id,
    sourceId: row.source_id,
    rawRecordId: row.raw_record_id,
    noticeIdentifier: row.notice_identifier,
    releaseId: row.release_id,
    noticeType: row.notice_type,
    noticeStage: row.notice_stage,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    modifiedAt: row.modified_at,
    isCurrentVersion: row.is_current_version,
  };
}

function mapLot(row: LotRow): LotRecord {
  return {
    id: row.id,
    dealId: row.deal_id,
    sourceLotId: row.source_lot_id,
    lotNumber: row.lot_number,
    sourceTitle: row.source_title,
    sourceDescription: row.source_description,
    status: row.status,
    currency: row.currency,
    valueMin: asNumber(row.value_min),
    valueMax: asNumber(row.value_max),
    exactLocationText: row.exact_location_text,
    submissionDeadline: row.submission_deadline,
    contractStartDate: row.contract_start_date,
    contractEndDate: row.contract_end_date,
    extensionEndDate: row.extension_end_date,
    smeSuitable: row.sme_suitable,
    vcseSuitable: row.vcse_suitable,
  };
}

function mapAward(row: AwardRow): AwardRecord {
  return {
    id: row.id,
    dealId: row.deal_id,
    lotId: row.lot_id,
    sourceNoticeId: row.source_notice_id,
    awardIdentifier: row.award_identifier,
    awardDate: row.award_date,
    awardValue: asNumber(row.award_value),
    currency: row.currency,
    numberOfTenders: row.number_of_tenders,
    numberOfSmeTenders: row.number_of_sme_tenders,
    numberOfVcseTenders: row.number_of_vcse_tenders,
    standstillEndAt: row.standstill_end_at,
  };
}

function mapContract(row: ContractRow): ContractRecord {
  return {
    id: row.id,
    dealId: row.deal_id,
    awardId: row.award_id,
    contractIdentifier: row.contract_identifier,
    signedDate: row.signed_date,
    startDate: row.start_date,
    endDate: row.end_date,
    extensionEndDate: row.extension_end_date,
    originalValue: asNumber(row.original_value),
    currentValue: asNumber(row.current_value),
    currency: row.currency,
    status: row.status,
  };
}

function dealInsert(deal: Parameters<IngestionStore["createDeal"]>[0]) {
  return {
    id: deal.id,
    primary_source_id: deal.primarySourceId,
    external_primary_id: deal.externalPrimaryId,
    ocid: deal.ocid,
    reference: deal.reference,
    source_title: deal.sourceTitle,
    source_description: deal.sourceDescription,
    buyer_organization_id: deal.buyerOrganizationId,
    deal_type: deal.dealType,
    buyer_sector: deal.buyerSector,
    stage: deal.stage,
    status: deal.status,
    main_category: deal.mainCategory,
    procurement_method: deal.procurementMethod,
    special_regime: deal.specialRegime,
    currency: deal.currency,
    value_min_ex_vat: deal.valueMinExVat,
    value_max_ex_vat: deal.valueMaxExVat,
    exact_value_text: deal.exactValueText,
    exact_location_text: deal.exactLocationText,
    enquiry_deadline: deal.enquiryDeadline,
    submission_deadline: deal.submissionDeadline,
    award_decision_date: deal.awardDecisionDate,
    contract_start_date: deal.contractStartDate,
    contract_end_date: deal.contractEndDate,
    extension_end_date: deal.extensionEndDate,
    next_procurement_date: deal.nextProcurementDate,
    estimated_renewal_date: deal.estimatedRenewalDate,
    sme_suitable: deal.smeSuitable,
    vcse_suitable: deal.vcseSuitable,
    source_url: deal.sourceUrl,
    application_url: deal.applicationUrl,
    first_published_at: deal.firstPublishedAt,
    latest_source_at: deal.latestSourceAt,
    last_verified_at: deal.lastVerifiedAt,
    data_quality_score: deal.dataQualityScore,
    source_count: deal.sourceCount ?? 1,
  };
}

export function createSupabaseIngestionStore(
  client: IngestionSupabaseClient,
): IngestionStore {
  return {
    async getSourceByKey(sourceKey) {
      const result = await client
        .from("data_sources")
        .select("*")
        .eq("source_key", sourceKey)
        .maybeSingle();
      const row = throwIfQueryError("Load data source", result);
      return row ? mapSource(row) : null;
    },
    async updateSource(id, patch) {
      const update: Database["public"]["Tables"]["data_sources"]["Update"] = {
        updated_at: new Date().toISOString(),
      };
      if (patch.lastSuccessAt !== undefined) {
        update.last_success_at = patch.lastSuccessAt;
      }
      if (patch.consecutiveFailures !== undefined) {
        update.consecutive_failures = patch.consecutiveFailures;
      }
      if (patch.apiUrl !== undefined) {
        update.api_url = patch.apiUrl;
      }
      if (patch.termsCheckedAt !== undefined) {
        update.terms_checked_at = patch.termsCheckedAt;
      }
      const result = await client.from("data_sources").update(update).eq("id", id);
      throwIfQueryError("Update data source", { data: result.data, error: result.error });
    },
    async createRun(input) {
      const result = await client
        .from("ingestion_runs")
        .insert({
          source_id: input.sourceId,
          status: input.status,
          trigger_type: input.triggerType,
          cursor_value: input.cursorValue ?? null,
          started_at: input.startedAt ?? new Date().toISOString(),
          metadata: asJson(input.metadata ?? {}),
        })
        .select("*")
        .single();
      const row = requireRow("Create ingestion run", result);
      return {
        id: row.id,
        sourceId: row.source_id,
        status: row.status,
        triggerType: row.trigger_type,
        cursorValue: row.cursor_value,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        discoveredCount: row.discovered_count,
        fetchedCount: row.fetched_count,
        newCount: row.new_count,
        updatedCount: row.updated_count,
        unchangedCount: row.unchanged_count,
        errorCount: row.error_count,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      } satisfies IngestionRunRecord;
    },
    async updateRun(id, patch) {
      const update: Database["public"]["Tables"]["ingestion_runs"]["Update"] = {};
      if (patch.status !== undefined) update.status = patch.status;
      if (patch.cursorValue !== undefined) update.cursor_value = patch.cursorValue;
      if (patch.startedAt !== undefined) update.started_at = patch.startedAt;
      if (patch.finishedAt !== undefined) update.finished_at = patch.finishedAt;
      if (patch.discoveredCount !== undefined) {
        update.discovered_count = patch.discoveredCount;
      }
      if (patch.fetchedCount !== undefined) update.fetched_count = patch.fetchedCount;
      if (patch.newCount !== undefined) update.new_count = patch.newCount;
      if (patch.updatedCount !== undefined) update.updated_count = patch.updatedCount;
      if (patch.unchangedCount !== undefined) {
        update.unchanged_count = patch.unchangedCount;
      }
      if (patch.errorCount !== undefined) update.error_count = patch.errorCount;
      if (patch.metadata !== undefined) update.metadata = asJson(patch.metadata);
      const result = await client.from("ingestion_runs").update(update).eq("id", id);
      throwIfQueryError("Update ingestion run", {
        data: result.data,
        error: result.error,
      });
    },
    async findRawRecord(sourceId, externalRecordId, contentHash) {
      const result = await client
        .from("raw_records")
        .select("*")
        .eq("source_id", sourceId)
        .eq("external_record_id", externalRecordId)
        .eq("content_hash", contentHash)
        .maybeSingle();
      const row = throwIfQueryError("Find raw record", result);
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        sourceId: row.source_id,
        ingestionRunId: row.ingestion_run_id,
        externalRecordId: row.external_record_id,
        sourceUrl: row.source_url,
        publishedAt: row.published_at,
        fetchedAt: row.fetched_at,
        contentHash: row.content_hash,
        contentType: row.content_type,
        rawPayload: row.raw_payload,
        parserVersion: row.parser_version,
      } satisfies RawRecordRow;
    },
    async insertRawRecord(input) {
      const existing = await this.findRawRecord(
        input.sourceId,
        input.externalRecordId,
        input.contentHash,
      );
      if (existing) {
        return { record: existing, created: false };
      }
      const result = await client
        .from("raw_records")
        .insert({
          source_id: input.sourceId,
          ingestion_run_id: input.ingestionRunId,
          external_record_id: input.externalRecordId,
          source_url: input.sourceUrl,
          published_at: input.publishedAt,
          fetched_at: input.fetchedAt,
          content_hash: input.contentHash,
          content_type: input.contentType,
          raw_payload: input.rawPayload as Database["public"]["Tables"]["raw_records"]["Insert"]["raw_payload"],
          parser_version: input.parserVersion,
        })
        .select("*")
        .single();
      if (result.error?.code === "23505") {
        const duplicate = await this.findRawRecord(
          input.sourceId,
          input.externalRecordId,
          input.contentHash,
        );
        if (duplicate) {
          return { record: duplicate, created: false };
        }
      }
      const row = requireRow("Insert raw record", result);
      return {
        record: {
          id: row.id,
          sourceId: row.source_id,
          ingestionRunId: row.ingestion_run_id,
          externalRecordId: row.external_record_id,
          sourceUrl: row.source_url,
          publishedAt: row.published_at,
          fetchedAt: row.fetched_at,
          contentHash: row.content_hash,
          contentType: row.content_type,
          rawPayload: row.raw_payload,
          parserVersion: row.parser_version,
        },
        created: true,
      };
    },
    async insertError(input) {
      const result = await client.from("ingestion_errors").insert({
        source_id: input.sourceId,
        ingestion_run_id: input.ingestionRunId,
        raw_record_id: input.rawRecordId,
        external_record_id: input.externalRecordId,
        error_stage: input.errorStage,
        error_code: input.errorCode,
        message: input.message,
        retryable: input.retryable,
        details: asJson(input.details) ?? {},
      });
      throwIfQueryError("Insert ingestion error", {
        data: result.data,
        error: result.error,
      });
    },
    async findOrgByIdentifier(scheme, value) {
      const result = await client
        .from("organization_identifiers")
        .select("organization_id")
        .eq("scheme", scheme)
        .eq("value", value)
        .maybeSingle();
      const row = throwIfQueryError("Find organisation identifier", result);
      if (!row) {
        return null;
      }
      const org = await client
        .from("organizations")
        .select("*")
        .eq("id", row.organization_id)
        .maybeSingle();
      const mapped = throwIfQueryError("Load organisation", org);
      return mapped ? mapOrg(mapped) : null;
    },
    async findOrgByDomain(domain) {
      const result = await client
        .from("organizations")
        .select("*")
        .eq("domain", domain)
        .maybeSingle();
      const row = throwIfQueryError("Find organisation by domain", result);
      return row ? mapOrg(row) : null;
    },
    async findOrgByNormalizedNameLocation(normalizedName, city, region) {
      let query = client
        .from("organizations")
        .select("*")
        .eq("normalized_name", normalizedName);
      if (city) {
        query = query.ilike("city", city);
      }
      if (region) {
        query = query.ilike("region", region);
      }
      const result = await query.maybeSingle();
      const row = throwIfQueryError("Find organisation by name", result);
      return row ? mapOrg(row) : null;
    },
    async findOrgByAlias(normalizedAlias) {
      const result = await client
        .from("organization_aliases")
        .select("organization_id")
        .eq("normalized_alias", normalizedAlias)
        .maybeSingle();
      const row = throwIfQueryError("Find organisation alias", result);
      if (!row) {
        return null;
      }
      const org = await client
        .from("organizations")
        .select("*")
        .eq("id", row.organization_id)
        .maybeSingle();
      const mapped = throwIfQueryError("Load organisation from alias", org);
      return mapped ? mapOrg(mapped) : null;
    },
    async listOrgsByNormalizedName(normalizedName) {
      const result = await client
        .from("organizations")
        .select("*")
        .eq("normalized_name", normalizedName);
      const rows = throwIfQueryError("List organisations by name", result) ?? [];
      return (rows ?? []).map(mapOrg);
    },
    async listOrganizations() {
      const result = await client.from("organizations").select("*").limit(500);
      const rows = throwIfQueryError("List organisations", result) ?? [];
      return (rows ?? []).map(mapOrg);
    },
    async createOrganization(input) {
      const result = await client
        .from("organizations")
        .insert({
          canonical_name: input.canonicalName,
          normalized_name: input.normalizedName,
          buyer_sector: input.buyerSector,
          website: input.website,
          domain: input.domain,
          email: input.email,
          phone: input.phone,
          address_line_1: input.addressLine1,
          city: input.city,
          region: input.region,
          postcode: input.postcode,
          country_code: input.countryCode,
          is_sme: input.isSme,
          is_vcse: input.isVcse,
        })
        .select("*")
        .single();
      return mapOrg(requireRow("Create organisation", result));
    },
    async addOrganizationIdentifier(input) {
      const result = await client.from("organization_identifiers").upsert(
        {
          organization_id: input.organizationId,
          scheme: input.scheme,
          value: input.value,
          uri: input.uri ?? null,
          is_primary: input.isPrimary ?? false,
        },
        { onConflict: "scheme,value", ignoreDuplicates: true },
      );
      throwIfQueryError("Add organisation identifier", {
        data: result.data,
        error: result.error,
      });
    },
    async addOrganizationAlias(input) {
      const result = await client.from("organization_aliases").upsert(
        {
          organization_id: input.organizationId,
          alias: input.alias,
          normalized_alias: input.normalizedAlias,
          source_id: input.sourceId ?? null,
        },
        {
          onConflict: "organization_id,normalized_alias",
          ignoreDuplicates: true,
        },
      );
      throwIfQueryError("Add organisation alias", {
        data: result.data,
        error: result.error,
      });
    },
    async addOrganizationContact(input) {
      const result = await client.from("organization_contacts").insert({
        organization_id: input.organizationId,
        name: input.name ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        source_id: input.sourceId ?? null,
        source_url: input.sourceUrl ?? null,
        published_for_procurement: input.publishedForProcurement ?? false,
      });
      throwIfQueryError("Add organisation contact", {
        data: result.data,
        error: result.error,
      });
    },
    async findDealBySourceExternalId(sourceId, externalPrimaryId) {
      const result = await client
        .from("deals")
        .select("*")
        .eq("primary_source_id", sourceId)
        .eq("external_primary_id", externalPrimaryId)
        .maybeSingle();
      const row = throwIfQueryError("Find deal by source id", result);
      return row ? mapDeal(row) : null;
    },
    async findDealByOcid(ocid) {
      const result = await client.from("deals").select("*").eq("ocid", ocid).maybeSingle();
      const row = throwIfQueryError("Find deal by OCID", result);
      return row ? mapDeal(row) : null;
    },
    async findDealBySourceReference(sourceId, reference) {
      const result = await client
        .from("deals")
        .select("*")
        .eq("primary_source_id", sourceId)
        .eq("reference", reference)
        .maybeSingle();
      const row = throwIfQueryError("Find deal by reference", result);
      return row ? mapDeal(row) : null;
    },
    async findDealByBuyerAndNormalizedTitle(buyerOrganizationId, normalizedTitle) {
      const result = await client
        .from("deals")
        .select("*")
        .eq("buyer_organization_id", buyerOrganizationId);
      const rows = throwIfQueryError("Find deals by buyer", result) ?? [];
      const match = (rows ?? []).find(
        (row) => normalizeTitle(row.source_title) === normalizedTitle,
      );
      return match ? mapDeal(match) : null;
    },
    async createDeal(input) {
      const result = await client
        .from("deals")
        .insert(dealInsert(input))
        .select("*")
        .single();
      return mapDeal(requireRow("Create deal", result));
    },
    async updateDeal(id, patch) {
      const update: Database["public"]["Tables"]["deals"]["Update"] = {
        updated_at: new Date().toISOString(),
      };
      if (patch.primarySourceId !== undefined) {
        update.primary_source_id = patch.primarySourceId;
      }
      if (patch.externalPrimaryId !== undefined) {
        update.external_primary_id = patch.externalPrimaryId;
      }
      if (patch.ocid !== undefined) update.ocid = patch.ocid;
      if (patch.reference !== undefined) update.reference = patch.reference;
      if (patch.sourceTitle !== undefined) update.source_title = patch.sourceTitle;
      if (patch.sourceDescription !== undefined) {
        update.source_description = patch.sourceDescription;
      }
      if (patch.buyerOrganizationId !== undefined) {
        update.buyer_organization_id = patch.buyerOrganizationId;
      }
      if (patch.dealType !== undefined) update.deal_type = patch.dealType;
      if (patch.buyerSector !== undefined) update.buyer_sector = patch.buyerSector;
      if (patch.stage !== undefined) update.stage = patch.stage;
      if (patch.status !== undefined) update.status = patch.status;
      if (patch.mainCategory !== undefined) update.main_category = patch.mainCategory;
      if (patch.procurementMethod !== undefined) {
        update.procurement_method = patch.procurementMethod;
      }
      if (patch.specialRegime !== undefined) {
        update.special_regime = patch.specialRegime;
      }
      if (patch.currency !== undefined) update.currency = patch.currency;
      if (patch.valueMinExVat !== undefined) {
        update.value_min_ex_vat = patch.valueMinExVat;
      }
      if (patch.valueMaxExVat !== undefined) {
        update.value_max_ex_vat = patch.valueMaxExVat;
      }
      if (patch.exactValueText !== undefined) {
        update.exact_value_text = patch.exactValueText;
      }
      if (patch.exactLocationText !== undefined) {
        update.exact_location_text = patch.exactLocationText;
      }
      if (patch.enquiryDeadline !== undefined) {
        update.enquiry_deadline = patch.enquiryDeadline;
      }
      if (patch.submissionDeadline !== undefined) {
        update.submission_deadline = patch.submissionDeadline;
      }
      if (patch.awardDecisionDate !== undefined) {
        update.award_decision_date = patch.awardDecisionDate;
      }
      if (patch.contractStartDate !== undefined) {
        update.contract_start_date = patch.contractStartDate;
      }
      if (patch.contractEndDate !== undefined) {
        update.contract_end_date = patch.contractEndDate;
      }
      if (patch.extensionEndDate !== undefined) {
        update.extension_end_date = patch.extensionEndDate;
      }
      if (patch.nextProcurementDate !== undefined) {
        update.next_procurement_date = patch.nextProcurementDate;
      }
      if (patch.estimatedRenewalDate !== undefined) {
        update.estimated_renewal_date = patch.estimatedRenewalDate;
      }
      if (patch.smeSuitable !== undefined) update.sme_suitable = patch.smeSuitable;
      if (patch.vcseSuitable !== undefined) update.vcse_suitable = patch.vcseSuitable;
      if (patch.sourceUrl !== undefined) update.source_url = patch.sourceUrl;
      if (patch.applicationUrl !== undefined) {
        update.application_url = patch.applicationUrl;
      }
      if (patch.firstPublishedAt !== undefined) {
        update.first_published_at = patch.firstPublishedAt;
      }
      if (patch.latestSourceAt !== undefined) {
        update.latest_source_at = patch.latestSourceAt;
      }
      if (patch.lastVerifiedAt !== undefined) {
        update.last_verified_at = patch.lastVerifiedAt;
      }
      if (patch.dataQualityScore !== undefined) {
        update.data_quality_score = patch.dataQualityScore;
      }
      if (patch.sourceCount !== undefined) update.source_count = patch.sourceCount;
      const result = await client.from("deals").update(update).eq("id", id).select("*").single();
      return mapDeal(requireRow("Update deal", result));
    },
    async findNotice(sourceId, noticeIdentifier, releaseId) {
      const result = await client
        .from("notices")
        .select("*")
        .eq("source_id", sourceId)
        .eq("notice_identifier", noticeIdentifier)
        .eq("release_id", releaseId)
        .maybeSingle();
      const row = throwIfQueryError("Find notice", result);
      return row ? mapNotice(row) : null;
    },
    async listNoticesForDeal(dealId) {
      const result = await client.from("notices").select("*").eq("deal_id", dealId);
      return (throwIfQueryError("List notices", result) ?? []).map(mapNotice);
    },
    async createNotice(input) {
      const result = await client
        .from("notices")
        .insert({
          deal_id: input.dealId,
          source_id: input.sourceId,
          raw_record_id: input.rawRecordId,
          notice_identifier: input.noticeIdentifier,
          release_id: input.releaseId,
          notice_type: input.noticeType,
          notice_stage: input.noticeStage,
          source_url: input.sourceUrl,
          published_at: input.publishedAt,
          modified_at: input.modifiedAt,
          is_current_version: input.isCurrentVersion,
        })
        .select("*")
        .single();
      return mapNotice(requireRow("Create notice", result));
    },
    async updateNotice(id, patch) {
      const result = await client
        .from("notices")
        .update({
          raw_record_id: patch.rawRecordId,
          notice_type: patch.noticeType,
          notice_stage: patch.noticeStage,
          source_url: patch.sourceUrl,
          published_at: patch.publishedAt,
          modified_at: patch.modifiedAt,
          is_current_version: patch.isCurrentVersion,
        })
        .eq("id", id)
        .select("*")
        .single();
      return mapNotice(requireRow("Update notice", result));
    },
    async findNoticeVersionByHash(noticeId, contentHash) {
      const result = await client
        .from("notice_versions")
        .select("*")
        .eq("notice_id", noticeId)
        .eq("content_hash", contentHash)
        .maybeSingle();
      const row = throwIfQueryError("Find notice version", result);
      return row
        ? {
            id: row.id,
            noticeId: row.notice_id,
            versionNumber: row.version_number,
            contentHash: row.content_hash,
            capturedAt: row.captured_at,
          }
        : null;
    },
    async listNoticeVersions(noticeId) {
      const result = await client
        .from("notice_versions")
        .select("*")
        .eq("notice_id", noticeId)
        .order("version_number", { ascending: true });
      return (throwIfQueryError("List notice versions", result) ?? []).map(
        (row): NoticeVersionRecord => ({
          id: row.id,
          noticeId: row.notice_id,
          versionNumber: row.version_number,
          contentHash: row.content_hash,
          capturedAt: row.captured_at,
        }),
      );
    },
    async insertNoticeVersion(input) {
      const result = await client
        .from("notice_versions")
        .insert({
          notice_id: input.noticeId,
          version_number: input.versionNumber,
          content_hash: input.contentHash,
          captured_at: input.capturedAt,
        })
        .select("*")
        .single();
      const row = requireRow("Insert notice version", result);
      return {
        id: row.id,
        noticeId: row.notice_id,
        versionNumber: row.version_number,
        contentHash: row.content_hash,
        capturedAt: row.captured_at,
      };
    },
    async findLot(dealId, sourceLotId) {
      const result = await client
        .from("lots")
        .select("*")
        .eq("deal_id", dealId)
        .eq("source_lot_id", sourceLotId)
        .maybeSingle();
      const row = throwIfQueryError("Find lot", result);
      return row ? mapLot(row) : null;
    },
    async listLotsForDeal(dealId) {
      const result = await client.from("lots").select("*").eq("deal_id", dealId);
      return (throwIfQueryError("List lots", result) ?? []).map(mapLot);
    },
    async createLot(input) {
      const result = await client
        .from("lots")
        .insert({
          deal_id: input.dealId,
          source_lot_id: input.sourceLotId,
          lot_number: input.lotNumber,
          source_title: input.sourceTitle,
          source_description: input.sourceDescription,
          status: input.status,
          currency: input.currency,
          value_min: input.valueMin,
          value_max: input.valueMax,
          exact_location_text: input.exactLocationText,
          submission_deadline: input.submissionDeadline,
          contract_start_date: input.contractStartDate,
          contract_end_date: input.contractEndDate,
          extension_end_date: input.extensionEndDate,
          sme_suitable: input.smeSuitable,
          vcse_suitable: input.vcseSuitable,
        })
        .select("*")
        .single();
      return mapLot(requireRow("Create lot", result));
    },
    async updateLot(id, patch) {
      const result = await client
        .from("lots")
        .update({
          lot_number: patch.lotNumber,
          source_title: patch.sourceTitle,
          source_description: patch.sourceDescription,
          status: patch.status,
          currency: patch.currency,
          value_min: patch.valueMin,
          value_max: patch.valueMax,
          exact_location_text: patch.exactLocationText,
          submission_deadline: patch.submissionDeadline,
          contract_start_date: patch.contractStartDate,
          contract_end_date: patch.contractEndDate,
          extension_end_date: patch.extensionEndDate,
          sme_suitable: patch.smeSuitable,
          vcse_suitable: patch.vcseSuitable,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();
      return mapLot(requireRow("Update lot", result));
    },
    async deleteRequirementsForNotice(noticeId) {
      const result = await client
        .from("requirements")
        .delete()
        .eq("source_notice_id", noticeId);
      throwIfQueryError("Delete requirements", {
        data: result.data,
        error: result.error,
      });
    },
    async insertRequirement(input) {
      const result = await client.from("requirements").insert({
        deal_id: input.dealId,
        lot_id: input.lotId ?? null,
        requirement_type: input.requirementType,
        name: input.name,
        description: input.description ?? null,
        mandatory: input.mandatory ?? null,
        source_notice_id: input.sourceNoticeId ?? null,
        is_inferred: false,
      });
      throwIfQueryError("Insert requirement", {
        data: result.data,
        error: result.error,
      });
    },
    async deleteAwardCriteriaForNotice(noticeId) {
      const result = await client
        .from("award_criteria")
        .delete()
        .eq("source_notice_id", noticeId);
      throwIfQueryError("Delete award criteria", {
        data: result.data,
        error: result.error,
      });
    },
    async insertAwardCriterion(input) {
      const result = await client.from("award_criteria").insert({
        deal_id: input.dealId,
        lot_id: input.lotId ?? null,
        criterion_name: input.criterionName,
        criterion_description: input.criterionDescription ?? null,
        criterion_type: input.criterionType ?? null,
        weight_percent: input.weightPercent ?? null,
        order_of_importance: input.orderOfImportance ?? null,
        source_notice_id: input.sourceNoticeId ?? null,
      });
      throwIfQueryError("Insert award criterion", {
        data: result.data,
        error: result.error,
      });
    },
    async findAward(dealId, awardIdentifier) {
      const result = await client
        .from("awards")
        .select("*")
        .eq("deal_id", dealId)
        .eq("award_identifier", awardIdentifier)
        .maybeSingle();
      const row = throwIfQueryError("Find award", result);
      return row ? mapAward(row) : null;
    },
    async createAward(input) {
      const result = await client
        .from("awards")
        .insert({
          deal_id: input.dealId,
          lot_id: input.lotId,
          source_notice_id: input.sourceNoticeId,
          award_identifier: input.awardIdentifier,
          award_date: input.awardDate,
          award_value: input.awardValue,
          currency: input.currency,
          number_of_tenders: input.numberOfTenders,
          number_of_sme_tenders: input.numberOfSmeTenders,
          number_of_vcse_tenders: input.numberOfVcseTenders,
          standstill_end_at: input.standstillEndAt,
        })
        .select("*")
        .single();
      return mapAward(requireRow("Create award", result));
    },
    async updateAward(id, patch) {
      const result = await client
        .from("awards")
        .update({
          lot_id: patch.lotId,
          source_notice_id: patch.sourceNoticeId,
          award_date: patch.awardDate,
          award_value: patch.awardValue,
          currency: patch.currency,
          number_of_tenders: patch.numberOfTenders,
          number_of_sme_tenders: patch.numberOfSmeTenders,
          number_of_vcse_tenders: patch.numberOfVcseTenders,
          standstill_end_at: patch.standstillEndAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();
      return mapAward(requireRow("Update award", result));
    },
    async addAwardSupplier(input) {
      const result = await client.from("award_suppliers").upsert(
        {
          award_id: input.awardId,
          organization_id: input.organizationId,
          awarded_value: input.awardedValue ?? null,
          is_sme: input.isSme ?? null,
          is_vcse: input.isVcse ?? null,
        },
        { onConflict: "award_id,organization_id", ignoreDuplicates: true },
      );
      throwIfQueryError("Add award supplier", {
        data: result.data,
        error: result.error,
      });
    },
    async findContract(dealId, contractIdentifier) {
      const result = await client
        .from("contracts")
        .select("*")
        .eq("deal_id", dealId)
        .eq("contract_identifier", contractIdentifier)
        .maybeSingle();
      const row = throwIfQueryError("Find contract", result);
      return row ? mapContract(row) : null;
    },
    async createContract(input) {
      const result = await client
        .from("contracts")
        .insert({
          deal_id: input.dealId,
          award_id: input.awardId,
          contract_identifier: input.contractIdentifier,
          signed_date: input.signedDate,
          start_date: input.startDate,
          end_date: input.endDate,
          extension_end_date: input.extensionEndDate,
          original_value: input.originalValue,
          current_value: input.currentValue,
          currency: input.currency,
          status: input.status,
        })
        .select("*")
        .single();
      return mapContract(requireRow("Create contract", result));
    },
    async updateContract(id, patch) {
      const result = await client
        .from("contracts")
        .update({
          award_id: patch.awardId,
          signed_date: patch.signedDate,
          start_date: patch.startDate,
          end_date: patch.endDate,
          extension_end_date: patch.extensionEndDate,
          original_value: patch.originalValue,
          current_value: patch.currentValue,
          currency: patch.currency,
          status: patch.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();
      return mapContract(requireRow("Update contract", result));
    },
    async findDocument(dealId, sourceUrl) {
      const result = await client
        .from("documents")
        .select("id")
        .eq("deal_id", dealId)
        .eq("source_url", sourceUrl)
        .maybeSingle();
      const row = throwIfQueryError("Find document", result);
      return row ? { id: row.id } : null;
    },
    async createDocument(input) {
      const result = await client.from("documents").insert({
        deal_id: input.dealId,
        notice_id: input.noticeId ?? null,
        lot_id: input.lotId ?? null,
        source_id: input.sourceId ?? null,
        name: input.name,
        document_type: input.documentType ?? null,
        source_url: input.sourceUrl,
        mime_type: input.mimeType ?? null,
        published_at: input.publishedAt ?? null,
        redistribution_permitted: input.redistributionPermitted ?? null,
        processing_status: "LINK_ONLY",
      });
      throwIfQueryError("Create document", {
        data: result.data,
        error: result.error,
      });
    },
    async hasDealOrganization(dealId, organizationId, role, lotId) {
      let query = client
        .from("deal_organizations")
        .select("id")
        .eq("deal_id", dealId)
        .eq("organization_id", organizationId)
        .eq("role", role);
      query = lotId ? query.eq("lot_id", lotId) : query.is("lot_id", null);
      const result = await query.maybeSingle();
      return Boolean(throwIfQueryError("Find deal organisation", result));
    },
    async addDealOrganization(input) {
      if (
        await this.hasDealOrganization(
          input.dealId,
          input.organizationId,
          input.role,
          input.lotId,
        )
      ) {
        return;
      }
      const result = await client.from("deal_organizations").insert({
        deal_id: input.dealId,
        organization_id: input.organizationId,
        role: input.role,
        lot_id: input.lotId ?? null,
        source_id: input.sourceId ?? null,
      });
      throwIfQueryError("Add deal organisation", {
        data: result.data,
        error: result.error,
      });
    },
    async upsertCpvCode(code, description) {
      const result = await client.from("cpv_codes").upsert(
        { code, description },
        { onConflict: "code" },
      );
      throwIfQueryError("Upsert CPV code", {
        data: result.data,
        error: result.error,
      });
    },
    async findCategoryBySlug(slug) {
      const result = await client
        .from("categories")
        .select("id, slug, name")
        .eq("slug", slug)
        .maybeSingle();
      return throwIfQueryError("Find category", result);
    },
    async hasClassification(dealId, cpvCode, lotId) {
      let query = client
        .from("deal_classifications")
        .select("id")
        .eq("deal_id", dealId)
        .eq("cpv_code", cpvCode);
      query = lotId ? query.eq("lot_id", lotId) : query.is("lot_id", null);
      const result = await query.maybeSingle();
      return Boolean(throwIfQueryError("Find classification", result));
    },
    async insertClassification(input) {
      const result = await client.from("deal_classifications").insert({
        deal_id: input.dealId,
        lot_id: input.lotId ?? null,
        cpv_code: input.cpvCode ?? null,
        category_id: input.categoryId ?? null,
        source_scheme: input.sourceScheme ?? null,
        source_code: input.sourceCode ?? null,
        source_description: input.sourceDescription ?? null,
        is_primary: input.isPrimary ?? false,
      });
      throwIfQueryError("Insert classification", {
        data: result.data,
        error: result.error,
      });
    },
    async insertDataChange(input) {
      const result = await client.from("data_changes").insert({
        deal_id: input.dealId,
        source_id: input.sourceId,
        change_type: input.changeType,
        field_name: input.fieldName,
        previous_value: input.previousValue as Database["public"]["Tables"]["data_changes"]["Insert"]["previous_value"],
        new_value: input.newValue as Database["public"]["Tables"]["data_changes"]["Insert"]["new_value"],
        material: input.material,
        occurred_at: input.occurredAt,
      });
      throwIfQueryError("Insert data change", {
        data: result.data,
        error: result.error,
      });
    },
    async hasRelatedDeal(dealId, relatedDealId, relationshipType) {
      const result = await client
        .from("related_deals")
        .select("deal_id")
        .eq("deal_id", dealId)
        .eq("related_deal_id", relatedDealId)
        .eq("relationship_type", relationshipType)
        .maybeSingle();
      return Boolean(throwIfQueryError("Find related deal", result));
    },
    async addRelatedDeal(input) {
      const result = await client.from("related_deals").upsert(
        {
          deal_id: input.dealId,
          related_deal_id: input.relatedDealId,
          relationship_type: input.relationshipType,
          confidence: input.confidence ?? null,
        },
        { onConflict: "deal_id,related_deal_id,relationship_type" },
      );
      throwIfQueryError("Add related deal", {
        data: result.data,
        error: result.error,
      });
    },
  };
}
