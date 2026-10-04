import * as cheerio from "cheerio";

import { FREE_ALERT_DTO_KEYS } from "@/lib/alerts/types";
import { DEAL_CATEGORY_CATALOG } from "@/lib/matching/categories";
import { DEADLINE_BANDS, DURATION_BANDS, VALUE_BANDS } from "@/lib/preview/bands";
import { BROAD_REGIONS } from "@/lib/preview/region";
import { PUBLIC_PREVIEW_DTO_KEYS } from "@/lib/search/dto";
import { indexableCategoryLandings } from "@/lib/seo/category-landings";

import type { Assertion, Ctx } from "../lib/probe";
import { ok } from "../lib/probe";
import { NON_PRO_ROLES, FREE_ROLES, type Role } from "../lib/scan";

export { FREE_ALERT_DTO_KEYS, PUBLIC_PREVIEW_DTO_KEYS, NON_PRO_ROLES, FREE_ROLES };

export const PUB_ROWS = ["B1", "B2", "B3", "B4", "B5", "B6", "F1", "F2", "F3", "F4", "F5", "F6"];
export const HELD_ROWS = [
  "A1", "A2", "A3", "A4", "E1",
  ...Array.from({ length: 20 }, (_, i) => `C${i + 1}`),
  "D1", "D2", "D3", "D4", "D5", "D6",
];

export function pubSlugs(ctx: Ctx): Set<string> {
  return new Set(PUB_ROWS.map((r) => ctx.row(r).slug));
}

export function heldSlugs(ctx: Ctx): Set<string> {
  return new Set(HELD_ROWS.map((r) => ctx.row(r).slug));
}

export function heldRows(): string[] {
  return process.env.LEAK_INCLUDE_RESIDUALS === "1" ? [...HELD_ROWS, "R1", "R2"] : HELD_ROWS;
}

export const CATEGORY_LANDINGS = indexableCategoryLandings();

export const STATIC_PAGES = [
  "/pricing",
  "/how-it-works",
  "/contact",
  "/privacy",
  "/terms",
  "/cookies",
  "/categories",
  "/checkout/success",
];

export const DTO_SNAKE_KEYS = [
  "slug", "preview_title", "preview_summary", "deal_type", "buyer_sector", "stage", "status", "main_category",
  "broad_region", "value_band", "deadline_band", "duration_band", "sme_suitability", "bid_complexity",
  "competition_level", "requirements_preview", "relevance_tags", "freshness_label", "relevance_score",
  "preview_reasons",
];
export const SITEMAP_KEYS = [
  "slug", "preview_title", "preview_summary", "main_category", "broad_region", "value_band", "deadline_band",
  "status", "last_modified",
];
export const SAVED_KEYS = ["saved_deal_id", "deal_id", "notes", "saved_at", ...DTO_SNAKE_KEYS.slice(0, 18)];

const LEVELS = new Set(["LOW", "MEDIUM", "HIGH", "UNKNOWN", null]);
const FRESHNESS = new Set(["New this week", "Updated this week", "Open opportunity"]);

export type EnumSets = Record<"deal_type" | "buyer_sector" | "deal_stage" | "deal_status", Set<string>>;

export function enumSets(ctx: Ctx): EnumSets {
  const rows = ctx.psqlJson<Array<{ t: string; v: string }>>(
    "select t.typname as t, e.enumlabel as v from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname in ('deal_type','buyer_sector','deal_stage','deal_status')",
  );
  const sets = { deal_type: new Set<string>(), buyer_sector: new Set<string>(), deal_stage: new Set<string>(), deal_status: new Set<string>() };
  for (const row of rows) sets[row.t as keyof EnumSets].add(row.v);
  return sets;
}

function inSet(set: Set<unknown>, value: unknown): boolean {
  return set.has(value as never);
}

/** Exact key set (an extra key fails and so does a missing one), plus the value domains of section 5.11. */
export function dtoAssertions(
  rows: unknown,
  keys: string[],
  enums: EnumSets,
  opts: { role: Role; label: string; sitemap?: boolean },
): Assertion[] {
  const out: Assertion[] = [];
  if (!Array.isArray(rows)) return [ok(`${opts.label}:array`, false, typeof rows)];
  const badKeys: string[] = [];
  const badValues: string[] = [];
  const cats = new Set<unknown>(DEAL_CATEGORY_CATALOG.map((c) => c.name));
  const regions = new Set<unknown>([...BROAD_REGIONS, null]);
  const valueBands = new Set<unknown>([...VALUE_BANDS, null]);
  const deadlineBands = new Set<unknown>([...DEADLINE_BANDS, null]);
  const durationBands = new Set<unknown>([...DURATION_BANDS, null]);
  for (const row of rows as Array<Record<string, unknown>>) {
    const actual = Object.keys(row).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...keys].sort())) {
      badKeys.push(`${row.slug}: ${actual.join(",")}`);
    }
    const bad = (field: string) => badValues.push(`${row.slug}.${field}=${JSON.stringify(row[field])}`);
    if ("deal_type" in row && !inSet(enums.deal_type, row.deal_type)) bad("deal_type");
    if ("buyer_sector" in row && !inSet(enums.buyer_sector, row.buyer_sector)) bad("buyer_sector");
    if ("stage" in row && !inSet(enums.deal_stage, row.stage)) bad("stage");
    if ("status" in row && !inSet(enums.deal_status, row.status)) bad("status");
    if ("main_category" in row && !inSet(cats, row.main_category)) bad("main_category");
    if ("broad_region" in row && !inSet(regions, row.broad_region)) bad("broad_region");
    if ("value_band" in row && !inSet(valueBands, row.value_band)) bad("value_band");
    if ("deadline_band" in row && !inSet(deadlineBands, row.deadline_band)) bad("deadline_band");
    if ("duration_band" in row && !inSet(durationBands, row.duration_band)) bad("duration_band");
    for (const level of ["sme_suitability", "bid_complexity", "competition_level"]) {
      if (level in row && !LEVELS.has(row[level] as never)) bad(level);
    }
    if ("requirements_preview" in row) {
      const req = row.requirements_preview;
      if (!Array.isArray(req) || req.length > 20 || req.some((r) => typeof r !== "string" || r.length > 500)) bad("requirements_preview");
    }
    if ("relevance_tags" in row) {
      const tags = row.relevance_tags;
      if (!Array.isArray(tags) || tags.length > 12 || tags.some((t) => typeof t !== "string")) bad("relevance_tags");
    }
    if ("freshness_label" in row && row.freshness_label !== null && !FRESHNESS.has(row.freshness_label as string)) bad("freshness_label");
    if (opts.role === "anon") {
      if ("relevance_score" in row && row.relevance_score !== null) bad("relevance_score");
      if ("preview_reasons" in row && JSON.stringify(row.preview_reasons) !== "[]") bad("preview_reasons");
    }
    if (opts.sitemap && "last_modified" in row) {
      const day = new Date(`${String(row.last_modified).slice(0, 10)}T00:00:00Z`).getUTCDay();
      if (day !== 1) bad("last_modified");
    }
  }
  out.push(ok(`${opts.label}:exact_keys`, badKeys.length === 0, badKeys.slice(0, 5)));
  out.push(ok(`${opts.label}:value_domains`, badValues.length === 0, badValues.slice(0, 10)));
  return out;
}

// ---------------------------------------------------------------------------
// HTML metadata
// ---------------------------------------------------------------------------

export type PageMeta = {
  title: string | null;
  metas: Array<{ key: string; content: string }>;
  canonical: string | null;
  jsonLd: Array<{ raw: string; parsed: unknown; error?: string }>;
};

/** <title>, <meta>, canonical and JSON-LD from the head and from any streamed tags in the body. */
export function pageMeta(html: string): PageMeta {
  const $ = cheerio.load(html);
  const metas: PageMeta["metas"] = [];
  $("meta").each((_, el) => {
    const key = $(el).attr("property") ?? $(el).attr("name");
    const content = $(el).attr("content");
    if (key && content !== undefined) metas.push({ key, content });
  });
  const jsonLd: PageMeta["jsonLd"] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html() ?? "";
    try {
      jsonLd.push({ raw, parsed: JSON.parse(raw) });
    } catch (error) {
      jsonLd.push({ raw, parsed: null, error: String(error) });
    }
  });
  return {
    title: $("title").first().text() || null,
    metas,
    canonical: $('link[rel="canonical"]').attr("href") ?? null,
    jsonLd,
  };
}

export function metaValues(meta: PageMeta, key: string): string[] {
  return meta.metas.filter((m) => m.key === key).map((m) => m.content);
}

export const FORBIDDEN_JSON_LD_KEYS = new Set([
  "buyer_name", "buyerName", "canonical_name", "canonicalName", "source_url", "sourceUrl", "source_title",
  "sourceTitle", "application_url", "applicationUrl", "ocid", "reference", "notice_identifier", "noticeIdentifier",
  "contact_email", "contactEmail", "email", "phone", "domain", "website",
]);

export function forbiddenJsonLdKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => forbiddenJsonLdKeys(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(FORBIDDEN_JSON_LD_KEYS.has(k) ? [`${path}.${k}`] : []),
      ...forbiddenJsonLdKeys(v, `${path}.${k}`),
    ]);
  }
  return [];
}

export function isNoindex(meta: PageMeta, headers: Array<[string, string]>): boolean {
  const robots = [...metaValues(meta, "robots"), ...headers.filter(([n]) => n === "x-robots-tag").map(([, v]) => v)];
  return robots.some((r) => /noindex/i.test(r));
}

/** META-01/02 assertions for one HTML response. */
export function metaAssertions(
  html: string,
  status: number,
  opts: { previewTitle?: string; mustNoindex?: boolean; jsonLdAllowed: boolean },
  headers: Array<[string, string]>,
): Assertion[] {
  const meta = pageMeta(html);
  const out: Assertion[] = [];
  if (opts.previewTitle) {
    out.push(ok("og_title_is_preview_title", metaValues(meta, "og:title").every((t) => t === opts.previewTitle) && metaValues(meta, "og:title").length > 0, metaValues(meta, "og:title")));
  }
  const images = [...metaValues(meta, "og:image"), ...metaValues(meta, "twitter:image")];
  out.push(ok("og_image_logo_only", images.every((src) => /\/brand\/dealatlas-logo\.png(?:$|\?)/.test(src)), images));
  const parseErrors = meta.jsonLd.filter((j) => j.error);
  out.push(ok("json_ld_parses", parseErrors.length === 0, parseErrors.map((j) => j.error)));
  const forbidden = meta.jsonLd.flatMap((j) => forbiddenJsonLdKeys(j.parsed));
  out.push(ok("json_ld_no_forbidden_keys", forbidden.length === 0, forbidden));
  if (!opts.jsonLdAllowed || status === 404) {
    out.push(ok("json_ld_absent", meta.jsonLd.length === 0, meta.jsonLd.length));
  }
  if (opts.mustNoindex) out.push(ok("noindex", isNoindex(meta, headers), metaValues(meta, "robots")));
  return out;
}
