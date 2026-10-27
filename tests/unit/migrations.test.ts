import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

const CANONICAL_TABLES = [
  "deals",
  "organizations",
  "notices",
  "documents",
  "data_sources",
] as const;

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

function readMigration(name: string) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
}

function expectedBundle(files: string[]) {
  return `${files
    .map((name) => {
      const body = readMigration(name).trimEnd();
      return [
        "-- ============================================================================",
        `-- BEGIN ${name}`,
        "-- ============================================================================",
        "",
        body,
        "",
        "-- ============================================================================",
        `-- END ${name}`,
        "-- ============================================================================",
      ].join("\n");
    })
    .join("\n\n")}\n`;
}

describe("supabase migrations", () => {
  const files = listMigrations();
  const sql = files.map(readMigration).join("\n");

  it("are numbered 0001-0026, 0028-0030, 0040-0043, 0045-0047, 0049, 0051-0054, leaving 0027, 0031-0039, 0044, 0048 and 0050 for open pull requests", () => {
    expect(files).toEqual([
      "0001_extensions_and_types.sql",
      "0002_core_schema.sql",
      "0003_user_billing_schema.sql",
      "0004_security_and_rls.sql",
      "0005_functions_and_indexes.sql",
      "0006_seed_reference_data.sql",
      "0007_search_preview_filters.sql",
      "0008_find_a_tender_ocds.sql",
      "0009_private_source_onboarding.sql",
      "0010_intelligence_preview_pipeline.sql",
      "0011_matching_pipeline.sql",
      "0012_deal_match_column_privileges.sql",
      "0013_alert_dedupe_and_digest.sql",
      "0014_intelligence_query_indexes.sql",
      "0015_export_usage_quota.sql",
      "0016_admin_operations.sql",
      "0017_job_runs.sql",
      "0018_preview_gate_v2_and_dto_rpcs.sql",
      "0019_revoke_client_preview_table_access.sql",
      "0020_template_slugs_and_gin_fastupdate.sql",
      "0021_publish_eligible_and_unpublish_stale.sql",
      "0022_unclassified_deal_status.sql",
      "0023_contracts_finder_ocds.sql",
      "0024_service_role_statement_timeout.sql",
      "0025_publish_upcoming_and_biddable_sort.sql",
      "0026_legacy_public_slugs.sql",
      "0028_publish_all_compliant_sources.sql",
      "0029_founding_member_slots.sql",
      "0030_founding_availability_and_claims.sql",
      "0040_publish_unknown_terms_sources.sql",
      "0041_preview_detail_allowlist.sql",
      "0042_gca_and_nhs_sources.sql",
      "0043_grant_sources.sql",
      "0045_devolved_ocds_portals.sql",
      "0046_search_preview_dtos_page_first.sql",
      "0047_founding_cancel_ends_membership.sql",
      "0049_ted_search_api.sql",
      "0051_match_data_pro_only.sql",
      "0052_alert_email_subscriptions.sql",
      "0053_search_preview_dtos_categories.sql",
      "0054_preview_slug_no_digit_runs.sql",
    ]);
  });

  it("0054 keeps preview_slug_is_template in lockstep with digit-run stripping", () => {
    const m = readMigration("0054_preview_slug_no_digit_runs.sql");
    expect(m).toContain("create or replace function private.preview_slug_is_template(");
    expect(m).toContain(String.raw`'\d{8,}'::text`);
    expect(m).toContain("sanitisedTitleFragment");
  });

  it("0053 adds a multi-raw category filter to search_preview_dtos without changing its contract", () => {
    const m = readMigration("0053_search_preview_dtos_categories.sql");
    expect(m).toContain("drop function if exists public.search_preview_dtos(");
    expect(m).toContain("create function public.search_preview_dtos(");
    expect(m).toContain("p_categories text[] default null");
    expect(m).toContain("dp.main_category = any(p_categories)");
    expect(m).toContain("coalesce(private.is_user_pro(auth.uid()), false)");
    expect(m).toContain("private.preview_dto_requirements(p.requirements_preview)");
    expect(m).toContain("private.preview_dto_reasons(p.match_reasons)");
    expect(m).toContain("p.total_count");

    const returns = m.slice(
      m.indexOf("returns table (", m.indexOf("create function public.search_preview_dtos(")),
      m.indexOf("language sql", m.indexOf("create function public.search_preview_dtos(")),
    );
    for (const column of [
      "slug",
      "preview_title",
      "preview_summary",
      "deal_type",
      "buyer_sector",
      "stage",
      "status",
      "main_category",
      "broad_region",
      "value_band",
      "deadline_band",
      "duration_band",
      "sme_suitability",
      "bid_complexity",
      "competition_level",
      "requirements_preview",
      "relevance_tags",
      "freshness_label",
      "relevance_score",
      "preview_reasons",
      "total_count",
    ]) {
      expect(returns, column).toMatch(new RegExp(String.raw`\b${column}\b`));
    }
    expect(returns).not.toMatch(/\bdeal_id\b/);

    expect(m).toMatch(
      /grant execute on function public\.search_preview_dtos\([\s\S]*?text\[\][\s\S]*?\) to anon, authenticated, service_role;/,
    );
  });

  it("0053 gives the export RPCs p_categories and keeps them service-role only", () => {
    const m = readMigration("0053_search_preview_dtos_categories.sql");
    for (const fn of ["search_deal_previews", "search_deal_previews_for_profile"]) {
      expect(m).toContain(`drop function if exists public.${fn}(`);
      expect(m).toContain(`create function public.${fn}(`);
      expect(m).toMatch(
        new RegExp(String.raw`create function public\.${fn}\([\s\S]*?p_categories text\[\] default null[\s\S]*?\)`, "i"),
      );
      expect(m).toMatch(
        new RegExp(String.raw`revoke all on function public\.${fn}\([\s\S]*?\) from public, anon, authenticated;`),
      );
      expect(m).toMatch(
        new RegExp(String.raw`grant execute on function public\.${fn}\([\s\S]*?\) to service_role;`),
      );
      expect(m).not.toMatch(
        new RegExp(String.raw`grant execute on function public\.${fn}\([\s\S]*?\) to [^;]*\b(anon|authenticated)\b`),
      );
    }
  });

  it("0047 ends founding on cancel, keeps the place used, and refuses rejoin", () => {
    const m = readMigration("0047_founding_cancel_ends_membership.sql");
    expect(m).toContain("status in ('active', 'ended')");
    expect(m).toContain("set founding_member = false");
    expect(m).toContain("return 'ineligible';");
    expect(m).not.toContain("return 'active';");
    expect(m).not.toMatch(/delete\s+from\s+private\.founding_slots/i);
  });

  it("keeps founding slots private and capped", () => {
    const sql = readMigration("0029_founding_member_slots.sql");
    expect(sql).toContain("private.founding_slots");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("v_held >= 25");
    expect(sql).toContain("v_others < 25");
    expect(sql).toContain("private.founding_cap_fallbacks");
    expect(sql).toContain("return 'standard'");
    expect(sql).not.toMatch(/set founding_member = false/);
    expect(sql).toContain("interval '30 minutes'");
    expect(sql).toContain("revoke all on table private.founding_slots from public, anon, authenticated, service_role");
    expect(sql).not.toMatch(/disable row level security/i);
  });

  it("claims one founder per event and per subscription", () => {
    const sql = readMigration("0030_founding_availability_and_claims.sql");
    expect(sql).toContain("provider_event_id text primary key");
    expect(sql).toContain("unique (dodo_subscription_id)");
    expect(sql).toContain("when unique_violation then");
    expect(sql).toContain(
      "revoke all on table private.founding_event_claims from public, anon, authenticated, service_role",
    );
    expect(sql).not.toMatch(/disable row level security/i);
  });

  it("publishes enabled UNKNOWN terms and keeps prohibited or unscrapeable sources out", () => {
    const sql = readMigration("0040_publish_unknown_terms_sources.sql");
    expect(sql).toContain("'UNKNOWN'::public.reuse_status");
    expect(sql).toContain("s.reuse_status <> 'PROHIBITED'::public.reuse_status");
    expect(sql).not.toContain("scraping_permitted");
    expect(sql).not.toMatch(/disable row level security/i);
  });

  it("publishes compliant sources with a null open deadline", () => {
    const sql = readMigration("0028_publish_all_compliant_sources.sql");
    expect(sql).toContain("OPEN_LICENSE");
    expect(sql).toContain("PERMISSION_GRANTED");
    expect(sql).not.toContain("OCDS_API");
    expect(sql).not.toContain("find-a-tender");
    expect(sql).not.toMatch(/disable row level security/i);
  });

  it("refuses legacy public slugs from the preview DTO", () => {
    const sql = readMigration("0026_legacy_public_slugs.sql");
    expect(sql).toContain("private.preview_slug_is_legacy");
    expect(sql).toContain("and not private.preview_slug_is_legacy(dp.slug, dp.deal_id)");
    expect(sql).toContain("revoke all on function private.preview_slug_is_legacy(text, uuid)");
  });

  it("publishes undated upcoming notices and sorts biddable deals first", () => {
    const sql = readMigration("0025_publish_upcoming_and_biddable_sort.sql");
    expect(sql).toContain("UPCOMING with a null deadline stays published");
    expect(sql).toContain("when lower(coalesce(p_sort, 'updated')) = 'biddable' and r.status = 'CLOSING_SOON'::public.deal_status then 0");
    expect(sql).toContain("p_sort text default 'updated'");
    expect(sql).not.toMatch(/enforce_preview_safety/);
    expect(sql).not.toMatch(/disable row level security/i);
  });

  it("0046 pages search_preview_dtos before building DTO columns, with the same sort and helpers", () => {
    const m = readMigration("0046_search_preview_dtos_page_first.sql");
    const page = m.indexOf("paged as (");
    const limit = m.indexOf("limit greatest(1, least(coalesce(p_limit, 20), 50))");
    const helpers = m.indexOf("private.preview_dto_requirements(p.requirements_preview)");
    expect(page).toBeGreaterThan(0);
    expect(limit).toBeGreaterThan(page);
    expect(helpers).toBeGreaterThan(limit);
    expect(m.slice(page, limit)).not.toMatch(/private\.preview_dto_/);
    expect(m).toContain("private.preview_dto_reasons(p.match_reasons)");
    expect(m).toContain("private.preview_freshness_label(p.created_at, p.updated_at)");
    expect(m).toContain("p.relevance_tags[1:12]");
    expect(m).toContain("count(*) over () as total_count");
    expect(m).toContain("when lower(coalesce(p_sort, 'updated')) = 'biddable' and r.status = 'CLOSING_SOON'::public.deal_status then 0");
    expect(m).toContain("where dp.is_published = true\n      and dp.leakage_risk = 'LOW'\n      and dp.unpublished_by_admin = false");
    expect(m).toContain("security definer");
    expect(m).not.toMatch(/\b(grant|revoke)\b/i);
    expect(m).not.toMatch(/disable row level security/i);
  });

  it("keeps search_deal_previews on deal_previews only after filter extension", () => {
    const search = readMigration("0007_search_preview_filters.sql");
    expect(search).toContain("from public.deal_previews dp");
    expect(search).toContain("p_value_band");
    expect(search).toContain("p_deadline_band");
    expect(search).not.toMatch(/from public\.deals\b/);
    expect(search).not.toMatch(/from public\.organizations\b/);
  });

  it("queues matches without exposing detail_reasons or canonical joins to clients", () => {
    const matching = readMigration("0011_matching_pipeline.sql");
    expect(matching).toContain("revoke select (detail_reasons)");
    expect(matching).toContain("create table if not exists public.match_jobs");
    expect(matching).toContain("search_deal_previews_for_profile");
    expect(matching).toContain("from public.deal_previews dp");
    expect(matching).toContain("left join public.deal_matches dm");
    expect(matching).not.toMatch(/from public\.deals\b/);
    expect(matching).not.toMatch(/from public\.organizations\b/);
    expect(matching).not.toMatch(
      /grant select on table public\.match_jobs to (anon|authenticated)/,
    );
    expect(matching).toContain(
      "grant execute on function public.search_deal_previews_for_profile",
    );
    expect(matching).toContain("to authenticated, service_role");
  });

  it("grants deal_matches preview columns without detail_reasons", () => {
    const privileges = readMigration("0012_deal_match_column_privileges.sql");
    expect(privileges).toContain("revoke select on table public.deal_matches from anon, authenticated");
    expect(privileges).toContain("preview_reasons");
    expect(privileges).toContain("on table public.deal_matches to authenticated");
    expect(privileges).not.toMatch(
      /grant select \([\s\S]*detail_reasons[\s\S]*\) on table public\.deal_matches to authenticated/,
    );
    expect(readMigration("0018_preview_gate_v2_and_dto_rpcs.sql")).toContain(
      "revoke select (preview_reasons) on table public.deal_matches from anon, authenticated;",
    );
  });

  it("keeps alerts server-only and unique per user dedupe key", () => {
    const alerts = readMigration("0013_alert_dedupe_and_digest.sql");
    expect(alerts).toContain("dedupe_key");
    expect(alerts).toContain("alerts_user_dedupe_key_uidx");
    expect(alerts).toContain("last_digest_sent_at");
    expect(alerts).not.toMatch(
      /grant (select|insert|update|delete) on table public\.alerts to (anon|authenticated)/i,
    );
  });

  it("adds intelligence query indexes without client grants or materialized history", () => {
    const indexes = readMigration("0014_intelligence_query_indexes.sql");
    expect(indexes).toContain("contracts_extension_end_date_idx");
    expect(indexes).toContain("related_deals_related_idx");
    expect(indexes).not.toMatch(/materialized view/i);
    expect(indexes).not.toMatch(
      /grant (select|insert|update|delete|all) on table public\.(organizations|awards|contracts) to (anon|authenticated)/i,
    );
  });

  it("enforces Pro CSV export quotas on export_usage without client grants", () => {
    const exportUsage = readMigration("0015_export_usage_quota.sql");
    expect(exportUsage).toContain("private.enforce_export_usage_limit");
    expect(exportUsage).toContain("pg_advisory_xact_lock");
    expect(exportUsage).toContain("export row limit reached");
    expect(exportUsage).toContain("1000");
    expect(exportUsage).not.toMatch(
      /grant (select|insert|update|delete) on table public\.export_usage to (anon|authenticated)/i,
    );
  });

  it("keeps admin audit and organisation merge server-only and holds unpublished previews", () => {
    const admin = readMigration("0016_admin_operations.sql");
    expect(admin).toContain("unpublished_by_admin");
    expect(admin).toContain("admin_audit_events");
    expect(admin).toContain("private.merge_organizations");
    expect(admin).toContain("public.admin_merge_organizations");
    expect(admin).toContain("if new.unpublished_by_admin then");
    expect(admin).not.toMatch(
      /grant (select|insert|update|delete|all) on table public\.admin_audit_events to (anon|authenticated)/i,
    );
    expect(admin).not.toMatch(
      /grant execute on function public\.admin_merge_organizations[\s\S]{0,80}to (anon|authenticated)/i,
    );
  });

  it("keeps operational job_runs server-only", () => {
    const jobs = readMigration("0017_job_runs.sql");
    expect(jobs).toContain("create table if not exists public.job_runs");
    expect(jobs).toContain("enable row level security");
    expect(jobs).not.toMatch(
      /grant (select|insert|update|delete|all) on table public\.job_runs to (anon|authenticated)/i,
    );
  });

  it("gates every preview write and exposes previews only through sanitised DTO RPCs", () => {
    const gate = readMigration("0018_preview_gate_v2_and_dto_rpcs.sql");
    expect(gate).toMatch(/before insert or update\s+on public\.deal_previews/);
    expect(gate).toContain(
      "alter table public.deal_previews enable always trigger enforce_preview_safety",
    );
    expect(gate).toContain("private.preview_leak_findings");
    expect(gate).toContain("current_period_end is not null");
    for (const fn of [
      "search_preview_dtos",
      "get_preview_dto_by_slug",
      "list_preview_sitemap_entries",
      "count_preview_sitemap_entries",
    ]) {
      expect(gate).toMatch(
        new RegExp(String.raw`grant execute on function public\.${fn}\([^)]*\)\s+to anon`, "i"),
      );
    }
    expect(gate).not.toMatch(
      /grant execute on function (public|private)\.(preview_leak_findings|detect_preview_leakage|admin_release_preview_hold)[\s\S]{0,120}to (anon|authenticated)/i,
    );
    for (const signature of [
      "get_preview_dto_by_deal_id(uuid)",
      "resolve_preview_deal_id(text)",
      "list_saved_deal_previews()",
    ]) {
      expect(gate).toContain(`revoke execute on function public.${signature} from anon`);
      expect(gate).toContain(`grant execute on function public.${signature} to authenticated, service_role`);
    }
    expect(gate).toContain("security definer");
    expect(gate).toMatch(
      /grant execute on function public\.search_deal_previews_for_profile\([\s\S]*?\) to anon, authenticated, service_role/,
    );
    expect(gate).not.toMatch(/preview_title % p_query/);
    expect(gate).toContain("public.saved_deal_row_visible(deal_id)");
    expect(gate).toContain("revoke all on function public.caller_misses_published_preview(uuid) from public, anon");
    expect(gate).toContain("grant execute on function public.caller_misses_published_preview(uuid) to authenticated, service_role");
  });

  it("revokes direct client access to deal_previews in a separate post-deploy migration", () => {
    const revoke = readMigration("0019_revoke_client_preview_table_access.sql");
    expect(revoke).toContain(
      "revoke all on table public.deal_previews from public, anon, authenticated",
    );
    expect(revoke).toContain("'saved_deal_row_visible'");
    expect(revoke).toContain("'caller_misses_published_preview'");
    expect(revoke).not.toMatch(/grant\s+(all|select)[\s\S]{0,60}to\s+(anon|authenticated)/i);
  });

  it("never disable RLS", () => {
    expect(sql).not.toMatch(/disable\s+row\s+level\s+security/i);
  });

  it("enable RLS and revoke client access before preview grants", () => {
    const security = readMigration("0004_security_and_rls.sql");
    expect(security).toMatch(/enable row level security/);
    expect(security).toMatch(/revoke all on table public\.%I from anon/);
    expect(security).toMatch(/revoke all on table public\.%I from authenticated/);
    expect(security).toMatch(
      /grant select on table public\.deal_previews to anon, authenticated/,
    );
  });

  it("do not grant anon or authenticated access to canonical tables", () => {
    const grantPattern = new RegExp(
      String.raw`grant\s+(all|select|insert|update|delete)[\s\S]{0,80}on\s+table\s+public\.(${CANONICAL_TABLES.join("|")})\b`,
      "i",
    );
    expect(sql).not.toMatch(grantPattern);
  });

  it("0041 keeps the rich-preview filter fail-closed and private (S&B PR42)", () => {
    const m = readMigration("0041_preview_detail_allowlist.sql");
    expect(m).toContain("create or replace function private.preview_detail_text_risky(p text)");
    expect(m).toContain("not private.preview_detail_text_risky(i.body)");
    expect(m).toContain(
      "revoke execute on function private.preview_dto_requirements(jsonb) from public, anon, authenticated;",
    );
    expect(m).toContain(
      "revoke execute on function private.preview_detail_text_risky(text) from public, anon, authenticated;",
    );
    expect(m).toContain("private.preview_dto_requirements(ranked.requirements_preview)");
    expect(m).toContain("private.preview_detail_findings(p_preview_title, p_preview_summary, p_requirements)");
    // Banned quasi-identifier fields are not in any allow-list.
    expect(m).not.toMatch(/when '(lotCount|procedureType|framework)' then/);
    expect(m).not.toMatch(/grant\s+execute[^;]*to\s+(anon|authenticated)/i);
  });

  it("0041 vocabularies match the TypeScript sources", async () => {
    const m = readMigration("0041_preview_detail_allowlist.sql");
    const q = (value: string) => `'${value.replace(/'/g, "''")}'`;
    const { CPV_DIVISION_TITLES } = await import("@/lib/preview/cpv-label");
    const { BROAD_REGIONS } = await import("@/lib/preview/region");
    const { REQUIREMENT_PREVIEW_LABELS } = await import("@/lib/preview/labels");
    const { PORTAL_TERMS, FRAMEWORK_TERMS, SAFE_UPPERCASE_TOKENS } = await import("@/lib/preview/risk");
    for (const value of [
      ...CPV_DIVISION_TITLES,
      ...BROAD_REGIONS,
      ...REQUIREMENT_PREVIEW_LABELS,
      ...PORTAL_TERMS,
      ...FRAMEWORK_TERMS,
      ...SAFE_UPPERCASE_TOKENS,
    ]) {
      expect(m, value).toContain(q(value));
    }
  });

  it("seeds blocked grant portals as prohibited and disabled", () => {
    const sql = readMigration("0043_grant_sources.sql");
    for (const key of ["etendersni", "ukri-funding-finder"]) {
      const row = sql.slice(sql.indexOf(`'${key}'`));
      expect(row).toContain("'PROHIBITED'");
      expect(row.slice(0, 700)).toContain("false");
    }
    expect(sql).toContain("Cloudflare/WAF");
    expect(sql).toContain("electronic reproduction");
    expect(sql).not.toMatch(/disable row level security/i);
  });

  it("keep the combined schema file in sync with migrations", () => {
    const bundled = fs.readFileSync(
      path.join(ROOT, "supabase", "dealatlas_full_schema.sql"),
      "utf8",
    );
    expect(bundled).toBe(expectedBundle(files));
  });


  it("0052 adds free alert email subscriptions with service-role-only access", () => {
    const body = readMigration("0052_alert_email_subscriptions.sql");
    expect(body).toContain("create table public.alert_email_subscriptions");
    expect(body).toContain("create table private.alert_signup_rate_limits");
    expect(body).toContain("hit_alert_signup_rate_limit");
    expect(body).toContain("revoke all on table public.alert_email_subscriptions from anon");
    expect(body).toContain("revoke all on table public.alert_email_subscriptions from authenticated");
    expect(body).toContain("grant select, insert, update on table public.alert_email_subscriptions to service_role");
    expect(body).toContain("grant execute on function public.hit_alert_signup_rate_limit");
    expect(body).not.toContain("grant select on table public.alert_email_subscriptions to anon");
    expect(body).not.toContain("grant select on table public.alert_email_subscriptions to authenticated");
  });

  it("returns match data from the preview DTOs only to Pro viewers", () => {
    const body = readMigration("0051_match_data_pro_only.sql");
    expect(body).toContain("create or replace function public.search_preview_dtos(");
    expect(body).toContain("create or replace function public.get_preview_dto_by_slug(");
    expect(body).toContain("create or replace function public.get_preview_dto_by_deal_id(");
    expect(body.match(/coalesce\(private\.is_user_pro\(auth\.uid\(\)\), false\)/g)).toHaveLength(3);
    expect(body).toContain("when o.requested_sort = 'relevance' and not o.pro then 'biddable'");
    expect(body).toContain("case when o.pro then p_min_score end as min_score");
    expect(body).not.toContain("p_min_score is null or");
    expect(body).not.toMatch(/lower\(coalesce\(p_sort, 'updated'\)\) = 'relevance'/);
  });

  it("adds a disabled TED Search API source and does not publish it", () => {
    const sql = readMigration("0049_ted_search_api.sql");
    expect(sql).toContain("'ted'");
    expect(sql).toContain("'JSON_API'");
    expect(sql).toContain("'OPEN_LICENSE'");
    expect(sql).toContain("https://ted.europa.eu/en/legal-notice");
    expect(sql).toContain("European Union");
    expect(sql).toContain("Do not use the TED logo");
    expect(sql).toContain("notice-type");
    expect(sql).toContain("deadline-receipt-request");
    expect(sql).toContain("place-of-performance");
    expect(sql).toMatch(/'OPEN_LICENSE',\n\s*false,\n\s*false,/);
    expect(sql).not.toMatch(/enabled = excluded\.enabled/);
  });

});

