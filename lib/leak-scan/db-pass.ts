import { buildPreviewSlug } from "@/lib/deals/public-slug";
import { structuredLog } from "@/lib/observability/log";
import { scanPreviewLeaks, type LeakScanInput } from "@/lib/redaction/scan";

import { codeCounts, type LeakFindingReport } from "@/lib/leak-scan/report";
import type { ReadonlyClient } from "@/lib/leak-scan/readonly-client";
import type { DealTokenSet, LegacySlug } from "@/lib/leak-scan/state";
import { sourceManifestTokens } from "@/lib/leak-scan/tokens";

export const PUBLISHED_BATCH = 100;
export const DB_BUDGET_MS = 15 * 60 * 1000;

const PREVIEW_COLUMNS =
  "deal_id, slug, preview_title, preview_summary, requirements_preview, relevance_tags, broad_region, is_published, unpublished_by_admin";
const DEAL_COLUMNS =
  "id, primary_source_id, source_title, source_description, ocid, reference, external_primary_id, source_url, application_url, buyer_organization_id, exact_value_text, value_min_ex_vat, value_max_ex_vat, submission_deadline, enquiry_deadline, first_published_at, award_decision_date, contract_start_date, contract_end_date, extension_end_date, next_procurement_date, estimated_renewal_date, exact_location_text";

type PreviewRow = {
  deal_id: string;
  slug: string;
  preview_title: string;
  preview_summary: string;
  requirements_preview: unknown;
  relevance_tags: unknown;
  broad_region: string | null;
  is_published: boolean;
  unpublished_by_admin: boolean;
};

type DealRow = {
  id: string;
  primary_source_id: string | null;
  source_title: string;
  source_description: string | null;
  ocid: string | null;
  reference: string | null;
  external_primary_id: string | null;
  source_url: string | null;
  application_url: string | null;
  buyer_organization_id: string | null;
  exact_value_text: string | null;
  value_min_ex_vat: number | string | null;
  value_max_ex_vat: number | string | null;
  submission_deadline: string | null;
  enquiry_deadline: string | null;
  first_published_at: string | null;
  award_decision_date: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  extension_end_date: string | null;
  next_procurement_date: string | null;
  estimated_renewal_date: string | null;
  exact_location_text: string | null;
};

export type DbPassResult = {
  scanned: number;
  failed: number;
  skipped: number;
  incomplete: boolean;
  findings: LeakFindingReport[];
  legacySlugs: LegacySlug[];
  dealTokens: DealTokenSet[];
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

async function readRows(filter: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<unknown[]> {
  const result = await filter;
  if (result.error) {
    throw new Error("leak scan read failed");
  }
  return result.data ?? [];
}

function legacySlug(previewTitle: string, dealId: string, currentSlug: string): string | null {
  const prefix = dealId.replace(/-/g, "").slice(0, 8).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(prefix)) return null;
  let candidate: string;
  try {
    candidate = buildPreviewSlug(previewTitle, prefix);
  } catch {
    return null;
  }
  if (candidate === currentSlug.toLowerCase()) return null;
  return candidate;
}

function scanInput(preview: PreviewRow, deal: DealRow, extras: {
  sourceName: string | null;
  sourceKey: string | null;
  buyerName: string | null;
  buyerAliases: string[];
  buyerDomain: string | null;
  buyerWebsite: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  buyerCity: string | null;
  buyerPostcode: string | null;
  sourceExtraText: string[];
  extraReferences: string[];
  lotLocations: Array<string | null>;
  sourceAmounts: Array<number | null>;
}): LeakScanInput {
  return {
    previewTitle: preview.preview_title,
    previewSummary: preview.preview_summary,
    requirementsPreview: stringList(preview.requirements_preview),
    relevanceTags: stringList(preview.relevance_tags),
    slug: preview.slug,
    broadRegion: preview.broad_region,
    sourceTitle: deal.source_title,
    sourceDescription: deal.source_description,
    sourceExtraText: extras.sourceExtraText,
    ocid: deal.ocid,
    reference: deal.reference,
    externalPrimaryId: deal.external_primary_id,
    noticeIdentifiers: [deal.external_primary_id, deal.reference, deal.ocid].filter(
      (item): item is string => Boolean(item),
    ),
    extraReferences: extras.extraReferences,
    sourceUrl: deal.source_url,
    applicationUrl: deal.application_url,
    sourceName: extras.sourceName,
    sourceKey: extras.sourceKey,
    buyerName: extras.buyerName,
    buyerAliases: extras.buyerAliases,
    buyerDomain: extras.buyerDomain,
    buyerWebsite: extras.buyerWebsite,
    buyerEmail: extras.buyerEmail,
    buyerPhone: extras.buyerPhone,
    exactValueText: deal.exact_value_text,
    valueMinExVat: asNumber(deal.value_min_ex_vat),
    valueMaxExVat: asNumber(deal.value_max_ex_vat),
    sourceAmounts: extras.sourceAmounts,
    submissionDeadline: deal.submission_deadline,
    sourceDates: [
      deal.enquiry_deadline,
      deal.first_published_at,
      deal.award_decision_date,
      deal.contract_start_date,
      deal.contract_end_date,
      deal.extension_end_date,
      deal.next_procurement_date,
      deal.estimated_renewal_date,
    ],
    exactLocationText: deal.exact_location_text,
    lotLocationTexts: extras.lotLocations,
    locationTerms: [extras.buyerCity],
    knownPostcodes: [extras.buyerPostcode],
  };
}

async function many<T>(
  client: ReadonlyClient,
  table: string,
  columns: string,
  column: string,
  values: string[],
  limit: number,
): Promise<T[]> {
  if (values.length === 0) return [];
  return (await readRows(client.from(table).select(columns).in(column, values).limit(limit))) as T[];
}

function indexBy<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) map.set(key(row), row);
  return map;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = map.get(id);
    if (list) list.push(row);
    else map.set(id, [row]);
  }
  return map;
}

export async function runDbPass(
  client: ReadonlyClient,
  options: { batchSize?: number; includeHeld?: boolean; now?: () => number; budgetMs?: number } = {},
): Promise<DbPassResult> {
  const batch = options.batchSize ?? PUBLISHED_BATCH;
  const budgetMs = options.budgetMs ?? DB_BUDGET_MS;
  const now = options.now ?? (() => Date.now());
  const started = now();
  const childLimit = Math.max(batch * 20, 20);
  const findings: LeakFindingReport[] = [];
  const legacySlugs: LegacySlug[] = [];
  const dealTokens: DealTokenSet[] = [];
  const seen = new Set<string>();
  let publishedScanned = 0;
  let publishedFailed = 0;
  let skipped = 0;
  let held = 0;
  let batchCount = 0;
  let incomplete = false;

  const scanPage = async (page: PreviewRow[]) => {
    const fresh = page.filter((row) => {
      if (seen.has(row.deal_id)) return false;
      seen.add(row.deal_id);
      return true;
    });
    const dealIds = fresh.map((row) => row.deal_id);
    const deals = await many<DealRow>(client, "deals", DEAL_COLUMNS, "id", dealIds, Math.max(dealIds.length, 1));
    const dealsById = indexBy(deals, (row) => row.id);
    const sourceIds = [...new Set(deals.map((row) => row.primary_source_id).filter((id): id is string => Boolean(id)))];
    const orgIds = [...new Set(deals.map((row) => row.buyer_organization_id).filter((id): id is string => Boolean(id)))];
    const [sources, orgs, aliases, lots, requirements] = await Promise.all([
      many<{ id: string; name: string | null; source_key: string | null }>(
        client,
        "data_sources",
        "id, name, source_key",
        "id",
        sourceIds,
        Math.max(sourceIds.length, 1),
      ),
      many<{
        id: string;
        canonical_name: string | null;
        domain: string | null;
        website: string | null;
        email: string | null;
        phone: string | null;
        city: string | null;
        postcode: string | null;
      }>(
        client,
        "organizations",
        "id, canonical_name, domain, website, email, phone, city, postcode",
        "id",
        orgIds,
        Math.max(orgIds.length, 1),
      ),
      many<{ organization_id: string; alias: string }>(
        client,
        "organization_aliases",
        "organization_id, alias",
        "organization_id",
        orgIds,
        childLimit,
      ),
      many<{
        deal_id: string;
        source_title: string | null;
        source_description: string | null;
        source_lot_id: string | null;
        exact_location_text: string | null;
        value_min: number | string | null;
        value_max: number | string | null;
      }>(
        client,
        "lots",
        "deal_id, source_title, source_description, source_lot_id, exact_location_text, value_min, value_max",
        "deal_id",
        dealIds,
        childLimit,
      ),
      many<{ deal_id: string; name: string | null; description: string | null }>(
        client,
        "requirements",
        "deal_id, name, description",
        "deal_id",
        dealIds,
        childLimit,
      ),
    ]);
    const sourcesById = indexBy(sources, (row) => row.id);
    const orgsById = indexBy(orgs, (row) => row.id);
    const aliasesByOrg = groupBy(aliases, (row) => row.organization_id);
    const lotsByDeal = groupBy(lots, (row) => row.deal_id);
    const requirementsByDeal = groupBy(requirements, (row) => row.deal_id);

    for (const preview of fresh) {
      const deal = dealsById.get(preview.deal_id);
      if (!deal) {
        skipped += 1;
        continue;
      }
      const source = deal.primary_source_id ? sourcesById.get(deal.primary_source_id) : undefined;
      const buyer = deal.buyer_organization_id ? orgsById.get(deal.buyer_organization_id) : undefined;
      const dealLots = lotsByDeal.get(preview.deal_id) ?? [];
      const dealRequirements = requirementsByDeal.get(preview.deal_id) ?? [];
      const input = scanInput(preview, deal, {
        sourceName: source?.name ?? null,
        sourceKey: source?.source_key ?? null,
        buyerName: buyer?.canonical_name ?? null,
        buyerAliases: (aliasesByOrg.get(deal.buyer_organization_id ?? "") ?? []).map((row) => row.alias).filter(Boolean),
        buyerDomain: buyer?.domain ?? null,
        buyerWebsite: buyer?.website ?? null,
        buyerEmail: buyer?.email ?? null,
        buyerPhone: buyer?.phone ?? null,
        buyerCity: buyer?.city ?? null,
        buyerPostcode: buyer?.postcode ?? null,
        sourceExtraText: [
          ...dealLots.flatMap((lot) => [lot.source_title, lot.source_description]),
          ...dealRequirements.flatMap((item) => [item.name, item.description]),
        ].filter((item): item is string => Boolean(item)),
        extraReferences: dealLots.map((lot) => lot.source_lot_id).filter((item): item is string => Boolean(item)),
        lotLocations: dealLots.map((lot) => lot.exact_location_text),
        sourceAmounts: dealLots.flatMap((lot) => [asNumber(lot.value_min), asNumber(lot.value_max)]),
      });
      const scan = scanPreviewLeaks(input);
      const rowHeld = preview.unpublished_by_admin === true || preview.is_published !== true;
      if (!rowHeld) publishedScanned += 1;
      if (scan.risk !== "LOW") {
        if (!rowHeld) publishedFailed += 1;
        const path = rowHeld ? null : `/deals/${preview.slug}`;
        for (const finding of scan.findings) {
          findings.push({ dealId: preview.deal_id, code: finding.code, path, held: rowHeld, pass: "db" });
        }
      }
      if (!rowHeld) {
        const legacy = legacySlug(preview.preview_title, preview.deal_id, preview.slug);
        if (legacy) legacySlugs.push({ dealId: preview.deal_id, slug: legacy });
      }
      dealTokens.push({
        dealId: preview.deal_id,
        slug: preview.slug,
        tokens: sourceManifestTokens({
          dealId: preview.deal_id,
          sourceTitle: deal.source_title,
          buyerName: buyer?.canonical_name ?? null,
          ocid: deal.ocid,
          reference: deal.reference,
          externalPrimaryId: deal.external_primary_id,
          sourceUrl: deal.source_url,
          buyerEmail: buyer?.email ?? null,
          sourceName: source?.name ?? null,
        }),
      });
    }
  };

  const walk = async (column: "is_published" | "unpublished_by_admin") => {
    let after: string | null = null;
    for (;;) {
      if (after !== null && now() - started >= budgetMs) {
        incomplete = true;
        return;
      }
      let filter = client
        .from("deal_previews")
        .select(PREVIEW_COLUMNS)
        .eq(column, true)
        .order("deal_id", { ascending: true })
        .limit(batch);
      if (after) filter = filter.gt("deal_id", after);
      const page = (await readRows(filter)) as PreviewRow[];
      if (page.length === 0) return;
      batchCount += 1;
      if (column === "unpublished_by_admin") held += page.length;
      await scanPage(page);
      const last = page[page.length - 1]?.deal_id;
      if (!last || last === after || page.length < batch) return;
      after = last;
    }
  };

  await walk("is_published");
  if (!incomplete && options.includeHeld) {
    if (now() - started >= budgetMs) incomplete = true;
    else await walk("unpublished_by_admin");
  }

  structuredLog({
    msg: "leak_scan_db",
    scanned: publishedScanned,
    failed: publishedFailed,
    skipped,
    held,
    batch_count: batchCount,
    batch_size: batch,
    incomplete: incomplete ? 1 : 0,
    db_codes: codeCounts(findings, "db") || "0",
  });

  return {
    scanned: publishedScanned,
    failed: publishedFailed,
    skipped,
    incomplete,
    findings,
    legacySlugs,
    dealTokens,
  };
}
