import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MATCH_REASON_CODES, PREVIEW_REASON_LABELS } from "@/lib/matching/types";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/0018_preview_gate_v2_and_dto_rpcs.sql",
);

function sqlLabels(): Map<string, string> {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf("create or replace function private.preview_dto_reasons(p jsonb)");
  expect(start).toBeGreaterThan(0);
  const body = sql.slice(start, sql.indexOf("$$;", start));
  const labels = new Map<string, string>();
  for (const m of body.matchAll(/when '([A-Z_]+)' then '((?:[^']|'')*)'/g)) {
    labels.set(m[1], m[2].replace(/''/g, "'"));
  }
  return labels;
}

describe("private.preview_dto_reasons canned labels", () => {
  it("match PREVIEW_REASON_LABELS exactly, code for code", () => {
    const labels = sqlLabels();
    expect([...labels.keys()].sort()).toEqual([...MATCH_REASON_CODES].sort());
    for (const code of MATCH_REASON_CODES) {
      expect(labels.get(code), code).toBe(PREVIEW_REASON_LABELS[code]);
    }
  });

  it("are the only label source in the client DTO RPCs", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    const start = sql.indexOf("create or replace function public.search_preview_dtos(");
    const end = sql.indexOf("create or replace function public.search_deal_previews_for_profile(");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const rpcs = sql.slice(start, end);
    expect(rpcs).not.toMatch(/coalesce\(\s*(?:dm\.preview_reasons|r\.match_reasons)/);
    expect(rpcs.match(/private\.preview_dto_reasons\(/g)?.length).toBe(3);
  });
});
