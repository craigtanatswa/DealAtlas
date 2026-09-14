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

  it("are numbered 0001-0006 in order with no gaps", () => {
    expect(files).toEqual([
      "0001_extensions_and_types.sql",
      "0002_core_schema.sql",
      "0003_user_billing_schema.sql",
      "0004_security_and_rls.sql",
      "0005_functions_and_indexes.sql",
      "0006_seed_reference_data.sql",
    ]);
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
