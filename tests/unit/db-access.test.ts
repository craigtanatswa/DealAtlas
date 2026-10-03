import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("typed data-access boundaries", () => {
  it("reads public previews only through the sanitised preview DTO RPCs", () => {
    const source = read("lib/db/previews.ts");
    expect(source).not.toContain('.from("deal_previews")');
    expect(source).not.toMatch(/rpc\(\s*["']search_deal_previews/);
    for (const fn of [
      "search_preview_dtos",
      "get_preview_dto_by_slug",
      "get_preview_dto_by_deal_id",
      "resolve_preview_deal_id",
      "list_preview_sitemap_entries",
      "count_preview_sitemap_entries",
    ]) {
      expect(source).toContain(`rpc("${fn}"`);
    }
    expect(source).toContain("p_value_band");
    expect(source).toContain("p_deadline_band");
    expect(source).toContain("p_statuses");
    expect(source).not.toMatch(/select\(\s*["']\*["']\s*\)/);
    expect(source).not.toContain('.from("deals")');
    expect(source).not.toContain('.from("organizations")');
    expect(source).not.toContain('.from("notices")');
    expect(source).not.toContain('.from("documents")');
    expect(source).not.toContain('.from("data_sources")');
    expect(source).not.toMatch(/from ["']@\/lib\/supabase\/admin["']/);
  });

  it("does not use select star in the public column list", () => {
    const source = read("lib/db/preview-columns.ts");
    const columns = source.slice(source.indexOf("export const DEAL_PREVIEW_PUBLIC_COLUMNS"));
    expect(columns).toContain("deal_id");
    expect(columns).toContain("preview_title");
    expect(columns).not.toContain('"*"');
    expect(columns).not.toContain("'*'");
    expect(columns).not.toContain("unpublished_by_admin");
    expect(columns).not.toContain("leakage_risk");
    expect(columns).not.toContain("is_published");
    expect(source).not.toContain("source_title");
    expect(source).not.toContain("source_url");
  });

  it("isolates canonical queries behind server-only", () => {
    const source = read("lib/db/canonical.ts");
    expect(source).toMatch(/import ["']server-only["']/);
    expect(source).toContain('.from("deals")');
    expect(source).toContain('.from("organizations")');
    expect(source).toContain('.from("notices")');
    expect(source).toContain('.from("documents")');
    expect(source).toContain('.from("data_sources")');
    expect(source).toContain('.from("lots")');
    expect(source).toContain('.from("requirements")');
    expect(source).toContain('.from("award_criteria")');
    expect(source).toContain('.from("data_changes")');
    expect(source).toContain('.from("deal_insights")');
    expect(source).toContain('.from("awards")');
    expect(source).toContain('.from("award_suppliers")');
    expect(source).toContain('.from("contracts")');
    expect(source).toContain('.from("deal_organizations")');
    expect(source).toContain('.from("related_deals")');
    expect(source).toContain("exact_location_text");
    expect(source).toContain("licence_name");
    expect(source).toContain("redistribution_permitted");
    expect(source).not.toMatch(/select\(\s*["']\*["']\s*\)/);
  });

  it("loads the subscriptions mirror with explicit columns behind server-only", () => {
    const source = read("lib/entitlements/store.ts");
    expect(source).toMatch(/import ["']server-only["']/);
    expect(source).toContain('.from("subscriptions")');
    expect(source).toContain("is_current");
    expect(source).not.toMatch(/select\(\s*["']\*["']\s*\)/);
    expect(source).not.toContain("dodo_customer_id");
    expect(source).not.toContain("payload");
  });

  it("does not re-export canonical queries from the public db index", () => {
    const source = read("lib/db/index.ts");
    expect(source).not.toMatch(/from ["']@\/lib\/db\/canonical["']/);
    expect(source).not.toMatch(/getCanonicalDealById/);
    expect(source).toContain("listPublishedDealPreviews");
  });

  it("types browser and SSR clients with the public schema only", () => {
    expect(read("lib/supabase/browser.ts")).toContain("PublicDatabase");
    expect(read("lib/supabase/server.ts")).toContain("PublicDatabase");
    expect(read("lib/supabase/anonymous.ts")).toContain("PublicDatabase");
    expect(read("lib/supabase/admin.ts")).toContain("Database");
    expect(read("lib/supabase/admin.ts")).not.toContain("PublicDatabase");
  });

  it("writes deal matches with the admin client and never selects star", () => {
    const persist = read("lib/matching/persist.ts");
    expect(persist).toMatch(/import ["']server-only["']/);
    expect(persist).toContain('.from("deal_matches")');
    expect(persist).toContain("preview_reasons");
    expect(persist).toContain("detail_reasons");
    expect(persist).not.toMatch(/select\(\s*["']\*["']\s*\)/);

    const load = read("lib/matching/load.ts");
    expect(load).not.toContain("select(\"*\")");
    expect(load).toContain("detail_reasons");
    // Stored reason columns are read only with the admin client after the
    // Pro check; client roles get canned labels through the DTO RPCs.
    expect(load.match(/\.from\("deal_matches"\)/g)?.length ?? 0).toBe(1);
    expect(load).toMatch(/const admin = createSupabaseAdminClient\(\);\s*const \{ data, error \} = await admin\s*\.from\("deal_matches"\)/);
  });

  it("loads alerts with an explicit server-only column list and never selects star", () => {
    const centre = read("lib/alerts/centre.ts");
    expect(centre).toMatch(/import ["']server-only["']/);
    expect(centre).toContain('.from("alerts")');
    expect(centre).toContain("protected_payload");
    expect(centre).not.toMatch(/select\(\s*["']\*["']\s*\)/);
    expect(read("lib/db/public-schema.ts")).not.toContain('"alerts"');
    expect(read("lib/db/public-schema.ts")).not.toContain("export_usage");
  });

  it("records export usage with explicit columns behind server-only", () => {
    const usage = read("lib/exports/usage.ts");
    expect(usage).toMatch(/import ["']server-only["']/);
    expect(usage).toContain('.from("export_usage")');
    expect(usage).toContain("row_count");
    expect(usage).toContain("billing_month");
    expect(usage).not.toMatch(/select\(\s*["']\*["']\s*\)/);
    expect(read("lib/db/public-schema.ts")).not.toContain('"export_usage"');
  });

  it("loads admin operations with explicit columns behind server-only", () => {
    const load = read("lib/admin/load.ts");
    expect(load).toMatch(/import ["']server-only["']/);
    expect(load).toContain('.from("data_sources")');
    expect(load).toContain('.from("ingestion_runs")');
    expect(load).toContain('.from("raw_records")');
    expect(load).toContain('.from("deal_previews")');
    expect(load).toContain("unpublished_by_admin");
    expect(load).not.toMatch(/select\(\s*["']\*["']\s*\)/);
    expect(read("lib/db/public-schema.ts")).not.toContain("admin_audit_events");
    expect(read("lib/admin/actions.ts")).toContain("requireAdminAction");
  });

  it("does not expose graphql_public through the local Data API config", () => {
    const config = read("supabase/config.toml");
    expect(config).toMatch(/schemas\s*=\s*\["public"\]/);
    expect(config).not.toMatch(/schemas\s*=\s*\[[^\]]*graphql_public/);
  });
});
