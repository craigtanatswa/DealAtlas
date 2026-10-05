import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BROAD_REGIONS } from "@/lib/preview/region";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/0018_preview_gate_v2_and_dto_rpcs.sql",
);

function sqlRegions(): string[] {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf("btrim(p_broad_region) <> all(array[");
  expect(start).toBeGreaterThan(0);
  const body = sql.slice(start, sql.indexOf("])", start));
  return [...body.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

describe("broad_region allowlist", () => {
  it("is identical in the SQL gate and BROAD_REGIONS", () => {
    expect(sqlRegions()).toEqual([...BROAD_REGIONS]);
  });
});
