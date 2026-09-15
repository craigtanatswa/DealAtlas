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

  it("are numbered 0001-0012 in order with no gaps", () => {
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
    ]);
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

  it("keep the combined schema file in sync with migrations", () => {
    const bundled = fs.readFileSync(
      path.join(ROOT, "supabase", "dealatlas_full_schema.sql"),
      "utf8",
    );
    expect(bundled).toBe(expectedBundle(files));
  });
});
