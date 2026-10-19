import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUYER_NAMES } from "@/lib/buyers/placeholder";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/0048_clear_placeholder_buyer_links.sql",
);

function sqlPlaceholderList(sql: string): string[] {
  const fn = sql.match(
    /function private\.placeholder_buyer_names\(\)[\s\S]*?select array\[([\s\S]*?)\]::text\[\]/,
  );
  if (!fn) throw new Error("private.placeholder_buyer_names() array not found in 0048");
  return [...fn[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

describe("0048 placeholder buyer list", () => {
  it("matches PLACEHOLDER_BUYER_NAMES exactly, in order", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sqlPlaceholderList(sql)).toEqual([...PLACEHOLDER_BUYER_NAMES]);
  });

  it("normalises the same way as the TS helper", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/[^.]normalize\(coalesce\(p, ''\), NFKC\)/);
    expect(sql).toMatch(/pg_catalog\.lower\(/);
    expect(sql).toMatch(/'\[\^\[:alnum:\]\]\+', ' ', 'g'/);
    expect(sql).toMatch(/pg_catalog\.btrim\(/);
  });
});
