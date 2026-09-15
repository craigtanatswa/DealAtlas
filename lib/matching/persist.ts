import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BuyerSector } from "@/lib/constants";
import type { Database, Json } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import {
  cosineSimilarity,
  createEmbeddingProvider,
  similarityToScore,
  type EmbeddingProvider,
} from "@/lib/matching/embeddings";
import {
  parseStoredReasons,
  reasonsToJson,
  sanitisedDetailReasons,
  sanitisedPreviewReasons,
} from "@/lib/matching/reasons";
import { dropLeakingReasons } from "@/lib/matching/sanitize";
import {
  dealEmbeddingText,
  profileEmbeddingText,
  scoreDealMatch,
} from "@/lib/matching/score";
import type {
  CompanyMatchProfile,
  MatchableDeal,
  SanitisedMatchReason,
} from "@/lib/matching/types";
import type { LeakScanInput } from "@/lib/redaction/scan";
import type { DealType } from "@/lib/search/filters";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = SupabaseClient<Database>;

const PREVIEW_BATCH = 80;
const PROFILE_BATCH = 80;

const PREVIEW_MATCH_COLUMNS =
  "deal_id, slug, preview_title, preview_summary, deal_type, buyer_sector, stage, status, main_category, broad_region, value_band, deadline_band, duration_band, sme_suitability, bid_complexity, competition_level, requirements_preview, relevance_tags, is_published, leakage_risk";

const PROFILE_COLUMNS =
  "id, company_description, products_services, preferred_category_slugs, preferred_cpv_codes, keywords, negative_keywords, preferred_regions, minimum_deal_value, maximum_deal_value, certifications, framework_memberships, preferred_buyer_sectors";

type PreviewRow = {
  deal_id: string;
  preview_title: string;
  preview_summary: string;
  deal_type: DealType;
  buyer_sector: BuyerSector;
  main_category: string | null;
  broad_region: string | null;
  value_band: string | null;
  requirements_preview: unknown;
  relevance_tags: string[] | null;
  is_published: boolean;
  leakage_risk: string;
};

type ProfileRow = {
  id: string;
  company_description: string | null;
  products_services: string[];
  preferred_category_slugs: string[];
  preferred_cpv_codes: string[];
  keywords: string[];
  negative_keywords: string[];
  preferred_regions: string[];
  minimum_deal_value: number | string | null;
  maximum_deal_value: number | string | null;
  certifications: string[];
  framework_memberships: string[];
  preferred_buyer_sectors: BuyerSector[];
};

type DealExtras = {
  cpvCodes: string[];
  valueMinExVat: number | null;
  valueMaxExVat: number | null;
  requirementNames: string[];
  requirementTypes: string[];
  mandatoryRequirementTypes: string[];
  commercialToolNames: string[];
  leakInput: LeakScanInput;
};

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function profileFromRow(row: ProfileRow): CompanyMatchProfile {
  return {
    companyDescription: row.company_description,
    productsServices: row.products_services ?? [],
    preferredCategorySlugs: row.preferred_category_slugs ?? [],
    preferredCpvCodes: row.preferred_cpv_codes ?? [],
    keywords: row.keywords ?? [],
    negativeKeywords: row.negative_keywords ?? [],
    preferredRegions: row.preferred_regions ?? [],
    minimumDealValue: asNumber(row.minimum_deal_value),
    maximumDealValue: asNumber(row.maximum_deal_value),
    certifications: row.certifications ?? [],
    frameworkMemberships: row.framework_memberships ?? [],
    preferredBuyerSectors: row.preferred_buyer_sectors ?? [],
  };
}

function emptyLeakInput(): LeakScanInput {
  return {
    previewTitle: "",
    previewSummary: "",
    requirementsPreview: [],
    sourceTitle: "",
    sourceDescription: null,
    ocid: null,
    reference: null,
    externalPrimaryId: null,
    sourceUrl: null,
    applicationUrl: null,
    sourceName: null,
    sourceKey: null,
    buyerName: null,
    buyerAliases: [],
    buyerDomain: null,
    buyerEmail: null,
    buyerPhone: null,
    exactValueText: null,
    valueMinExVat: null,
    valueMaxExVat: null,
    submissionDeadline: null,
    exactLocationText: null,
  };
}

async function loadExtras(
  admin: AdminClient,
  dealIds: string[],
): Promise<Map<string, DealExtras>> {
  const extras = new Map<string, DealExtras>();
  for (const dealId of dealIds) {
    extras.set(dealId, {
      cpvCodes: [],
      valueMinExVat: null,
      valueMaxExVat: null,
      requirementNames: [],
      requirementTypes: [],
      mandatoryRequirementTypes: [],
      commercialToolNames: [],
      leakInput: emptyLeakInput(),
    });
  }
  if (dealIds.length === 0) {
    return extras;
  }

  const [deals, classifications, requirements, tools] = await Promise.all([
    admin
      .from("deals")
      .select(
        "id, source_title, source_description, ocid, reference, external_primary_id, source_url, application_url, exact_value_text, value_min_ex_vat, value_max_ex_vat, submission_deadline, exact_location_text, buyer_organization_id",
      )
      .in("id", dealIds),
    admin.from("deal_classifications").select("deal_id, cpv_code").in("deal_id", dealIds),
    admin
      .from("requirements")
      .select("deal_id, name, requirement_type, mandatory")
      .in("deal_id", dealIds),
    admin.from("commercial_tools").select("deal_id, name").in("deal_id", dealIds),
  ]);

  throwIfQueryError("Failed to load deals for matching", {
    data: deals.data ?? [],
    error: deals.error,
  });
  throwIfQueryError("Failed to load classifications for matching", {
    data: classifications.data ?? [],
    error: classifications.error,
  });
  throwIfQueryError("Failed to load requirements for matching", {
    data: requirements.data ?? [],
    error: requirements.error,
  });
  throwIfQueryError("Failed to load commercial tools for matching", {
    data: tools.data ?? [],
    error: tools.error,
  });

  const buyerIds = [
    ...new Set(
      (deals.data ?? [])
        .map((row) => row.buyer_organization_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const buyers = buyerIds.length
    ? await admin
        .from("organizations")
        .select("id, canonical_name, domain, email, phone")
        .in("id", buyerIds)
    : { data: [], error: null };
  throwIfQueryError("Failed to load buyers for matching", {
    data: buyers.data ?? [],
    error: buyers.error,
  });
  const buyerById = new Map((buyers.data ?? []).map((row) => [row.id, row]));

  for (const row of deals.data ?? []) {
    const current = extras.get(row.id);
    if (!current) {
      continue;
    }
    const buyer = row.buyer_organization_id
      ? buyerById.get(row.buyer_organization_id)
      : undefined;
    current.valueMinExVat = asNumber(row.value_min_ex_vat);
    current.valueMaxExVat = asNumber(row.value_max_ex_vat);
    current.leakInput = {
      ...emptyLeakInput(),
      sourceTitle: row.source_title,
      sourceDescription: row.source_description,
      ocid: row.ocid,
      reference: row.reference,
      externalPrimaryId: row.external_primary_id,
      sourceUrl: row.source_url,
      applicationUrl: row.application_url,
      buyerName: buyer?.canonical_name ?? null,
      buyerDomain: buyer?.domain ?? null,
      buyerEmail: buyer?.email ?? null,
      buyerPhone: buyer?.phone ?? null,
      exactValueText: row.exact_value_text,
      valueMinExVat: asNumber(row.value_min_ex_vat),
      valueMaxExVat: asNumber(row.value_max_ex_vat),
      submissionDeadline: row.submission_deadline,
      exactLocationText: row.exact_location_text,
    };
  }

  for (const row of classifications.data ?? []) {
    const current = extras.get(row.deal_id);
    if (current && row.cpv_code) {
      current.cpvCodes.push(row.cpv_code);
    }
  }

  for (const row of requirements.data ?? []) {
    const current = extras.get(row.deal_id);
    if (!current) {
      continue;
    }
    if (row.name) {
      current.requirementNames.push(row.name);
    }
    if (row.requirement_type) {
      current.requirementTypes.push(row.requirement_type);
      if (row.mandatory) {
        current.mandatoryRequirementTypes.push(row.requirement_type);
      }
    }
  }

  for (const row of tools.data ?? []) {
    if (!row.deal_id || !row.name) {
      continue;
    }
    const current = extras.get(row.deal_id);
    if (current) {
      current.commercialToolNames.push(row.name);
    }
  }

  return extras;
}

function toMatchableDeal(preview: PreviewRow, extras: DealExtras | undefined): MatchableDeal {
  return {
    dealId: preview.deal_id,
    previewTitle: preview.preview_title,
    previewSummary: preview.preview_summary,
    mainCategory: preview.main_category,
    broadRegion: preview.broad_region,
    valueBand: preview.value_band,
    buyerSector: preview.buyer_sector,
    dealType: preview.deal_type,
    relevanceTags: preview.relevance_tags ?? [],
    requirementsPreview: stringArray(preview.requirements_preview),
    cpvCodes: extras?.cpvCodes ?? [],
    valueMinExVat: extras?.valueMinExVat ?? null,
    valueMaxExVat: extras?.valueMaxExVat ?? null,
    requirementNames: extras?.requirementNames ?? [],
    requirementTypes: extras?.requirementTypes ?? [],
    mandatoryRequirementTypes: extras?.mandatoryRequirementTypes ?? [],
    commercialToolNames: extras?.commercialToolNames ?? [],
  };
}

async function semanticScoreFor(
  provider: EmbeddingProvider | null,
  profile: CompanyMatchProfile,
  deal: MatchableDeal,
): Promise<number | null> {
  if (!provider) {
    return null;
  }
  const profileText = profileEmbeddingText(profile);
  const dealText = dealEmbeddingText(deal);
  if (!profileText.trim() || !dealText.trim()) {
    return null;
  }
  const vectors = await provider.embed([profileText, dealText]);
  if (!vectors || vectors.length < 2 || !vectors[0] || !vectors[1]) {
    return null;
  }
  return similarityToScore(cosineSimilarity(vectors[0], vectors[1]));
}

function matchRow(input: {
  profileId: string;
  dealId: string;
  relevanceScore: number;
  components: ReturnType<typeof scoreDealMatch>["components"];
  previewReasons: SanitisedMatchReason[];
  detailReasons: SanitisedMatchReason[];
}) {
  return {
    company_profile_id: input.profileId,
    deal_id: input.dealId,
    relevance_score: input.relevanceScore,
    category_score: input.components.category,
    keyword_score: input.components.keyword,
    location_score: input.components.location,
    value_score: input.components.value,
    sector_score: input.components.sector,
    certification_score: input.components.certification,
    semantic_score: input.components.semantic,
    preview_reasons: reasonsToJson(input.previewReasons) as Json,
    detail_reasons: reasonsToJson(input.detailReasons) as Json,
    calculated_at: new Date().toISOString(),
  };
}

async function upsertMatches(
  admin: AdminClient,
  rows: ReturnType<typeof matchRow>[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const { error } = await admin.from("deal_matches").upsert(rows, {
    onConflict: "company_profile_id,deal_id",
  });
  throwIfQueryError("Failed to save deal matches", { data: true, error });
}

async function scorePair(input: {
  profileId: string;
  profile: CompanyMatchProfile;
  preview: PreviewRow;
  extras: DealExtras | undefined;
  embedding: EmbeddingProvider | null;
}) {
  const deal = toMatchableDeal(input.preview, input.extras);
  const semantic = await semanticScoreFor(input.embedding, input.profile, deal);
  const scored = scoreDealMatch(input.profile, deal, { semanticScore: semantic });
  const leakInput = input.extras?.leakInput;
  const previewReasons = dropLeakingReasons(
    sanitisedPreviewReasons(scored.reasons, {
      limit: 4,
      includeMismatches: true,
    }),
    leakInput,
  );
  const limitedPreview = previewReasons.filter(
    (reason) => reason.kind === "match" || reason.code === "NEGATIVE_KEYWORD" || reason.code === "PROFILE_LIMITED",
  ).slice(0, 3);
  const detailReasons = dropLeakingReasons(
    sanitisedDetailReasons(scored.reasons, { limit: 8 }),
    leakInput,
  );
  return matchRow({
    profileId: input.profileId,
    dealId: input.preview.deal_id,
    relevanceScore: scored.relevanceScore,
    components: scored.components,
    previewReasons: limitedPreview.length > 0 ? limitedPreview : previewReasons.slice(0, 3),
    detailReasons,
  });
}

export async function listPublishedPreviewsForMatching(
  admin: AdminClient,
  options?: { dealId?: string; offset?: number; limit?: number },
): Promise<PreviewRow[]> {
  let query = admin
    .from("deal_previews")
    .select(PREVIEW_MATCH_COLUMNS)
    .eq("is_published", true)
    .eq("leakage_risk", "LOW")
    .order("updated_at", { ascending: false })
    .range(
      options?.offset ?? 0,
      (options?.offset ?? 0) + (options?.limit ?? PREVIEW_BATCH) - 1,
    );
  if (options?.dealId) {
    query = query.eq("deal_id", options.dealId);
  }
  const { data, error } = await query;
  return throwIfQueryError("Failed to list published previews for matching", {
    data: (data as PreviewRow[] | null) ?? [],
    error,
  });
}

export async function listCompanyProfilesForMatching(
  admin: AdminClient,
  options?: { profileId?: string; offset?: number; limit?: number },
): Promise<ProfileRow[]> {
  let query = admin
    .from("company_profiles")
    .select(PROFILE_COLUMNS)
    .order("updated_at", { ascending: false })
    .range(
      options?.offset ?? 0,
      (options?.offset ?? 0) + (options?.limit ?? PROFILE_BATCH) - 1,
    );
  if (options?.profileId) {
    query = query.eq("id", options.profileId);
  }
  const { data, error } = await query;
  return throwIfQueryError("Failed to list company profiles for matching", {
    data: (data as ProfileRow[] | null) ?? [],
    error,
  });
}

export async function recalculateMatches(input: {
  companyProfileId?: string | null;
  dealId?: string | null;
  cursorOffset?: number;
  maxPairs?: number;
  admin?: AdminClient;
  embedding?: EmbeddingProvider | null;
}): Promise<{ written: number; remaining: boolean; nextOffset: number }> {
  const admin = input.admin ?? createSupabaseAdminClient();
  const embedding =
    input.embedding === undefined ? createEmbeddingProvider() : input.embedding;
  const maxPairs = input.maxPairs ?? 120;
  const startOffset = Math.max(0, input.cursorOffset ?? 0);

  if (input.dealId) {
    const previews = await listPublishedPreviewsForMatching(admin, {
      dealId: input.dealId,
      limit: 1,
    });
    if (previews.length === 0) {
      const { error } = await admin.from("deal_matches").delete().eq("deal_id", input.dealId);
      throwIfQueryError("Failed to clear matches for unpublished deal", {
        data: true,
        error,
      });
      return { written: 0, remaining: false, nextOffset: startOffset };
    }
    const extras = await loadExtras(admin, [input.dealId]);
    let offset = startOffset;
    let written = 0;
    let remaining = false;
    while (written < maxPairs) {
      const profiles = await listCompanyProfilesForMatching(admin, {
        profileId: input.companyProfileId ?? undefined,
        offset,
        limit: PROFILE_BATCH,
      });
      if (profiles.length === 0) {
        break;
      }
      const rows = [];
      let processed = 0;
      for (const profile of profiles) {
        if (written >= maxPairs) {
          remaining = true;
          break;
        }
        rows.push(
          await scorePair({
            profileId: profile.id,
            profile: profileFromRow(profile),
            preview: previews[0]!,
            extras: extras.get(input.dealId),
            embedding,
          }),
        );
        written += 1;
        processed += 1;
      }
      await upsertMatches(admin, rows);
      offset += processed;
      if (remaining || profiles.length < PROFILE_BATCH) {
        break;
      }
    }
    return { written, remaining, nextOffset: offset };
  }

  const profiles = await listCompanyProfilesForMatching(admin, {
    profileId: input.companyProfileId ?? undefined,
    limit: input.companyProfileId ? 1 : PROFILE_BATCH,
  });
  if (profiles.length === 0) {
    return { written: 0, remaining: false, nextOffset: startOffset };
  }

  let offset = startOffset;
  let written = 0;
  let remaining = false;
  while (written < maxPairs) {
    const previews = await listPublishedPreviewsForMatching(admin, {
      offset,
      limit: PREVIEW_BATCH,
    });
    if (previews.length === 0) {
      break;
    }
    const extras = await loadExtras(
      admin,
      previews.map((row) => row.deal_id),
    );
    const rows = [];
    let processedPreviews = 0;
    for (const preview of previews) {
      if (written >= maxPairs) {
        remaining = true;
        break;
      }
      for (const profile of profiles) {
        rows.push(
          await scorePair({
            profileId: profile.id,
            profile: profileFromRow(profile),
            preview,
            extras: extras.get(preview.deal_id),
            embedding,
          }),
        );
        written += 1;
        if (written >= maxPairs) {
          remaining = true;
          break;
        }
      }
      if (remaining) {
        break;
      }
      processedPreviews += 1;
    }
    await upsertMatches(admin, rows);
    offset += processedPreviews;
    if (previews.length < PREVIEW_BATCH) {
      break;
    }
  }

  return { written, remaining, nextOffset: offset };
}

export function parsePreviewReasons(value: unknown): SanitisedMatchReason[] {
  return parseStoredReasons(value);
}
