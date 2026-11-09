import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BROAD_REGIONS,
  LOW_VOLUME_COUNTRIES,
  PUBLISHABLE_REGIONS,
  countryRegion,
} from "@/lib/preview/region";

const MIGRATION_0018 = path.join(
  process.cwd(),
  "supabase/migrations/0018_preview_gate_v2_and_dto_rpcs.sql",
);
const MIGRATION_0059 = path.join(
  process.cwd(),
  "supabase/migrations/0059_country_regions_in_leak_gate.sql",
);
const FULL_SCHEMA = path.join(process.cwd(), "supabase/dealatlas_full_schema.sql");

const BLOCK_BEGIN = "-- BEGIN 0059_country_regions_in_leak_gate.sql";
const BLOCK_END = "-- END 0059_country_regions_in_leak_gate.sql";

const BUCKETED_COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria",
  BG: "Bulgaria",
  CH: "Switzerland",
  CY: "Cyprus",
  EL: "Greece",
  GR: "Greece",
  HR: "Croatia",
  HU: "Hungary",
  IS: "Iceland",
  IT: "Italy",
  LI: "Liechtenstein",
  LT: "Lithuania",
  LU: "Luxembourg",
  MT: "Malta",
  NO: "Norway",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  SK: "Slovakia",
};

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function quotedStrings(body: string): string[] {
  return [...body.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

function sqlRegions(): string[] {
  const sql = read(MIGRATION_0018);
  const start = sql.indexOf("btrim(p_broad_region) <> all(array[");
  expect(start).toBeGreaterThan(0);
  const body = sql.slice(start, sql.indexOf("])", start));
  return quotedStrings(body);
}

function broadRegionsFrom0059(): string[] {
  const sql = read(MIGRATION_0059);
  const marker = "btrim(p_broad_region) <> all(array[";
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThan(0);
  const bodyStart = start + marker.length;
  const body = sql.slice(bodyStart, sql.indexOf("])", bodyStart));
  return quotedStrings(body);
}

function requirementsRegionsFrom0059(): string[] {
  const sql = read(MIGRATION_0059);
  const end = sql.indexOf("]::text[] as regions");
  expect(end).toBeGreaterThan(0);
  const start = sql.lastIndexOf("array[", end);
  expect(start).toBeGreaterThan(0);
  return quotedStrings(sql.slice(start + "array[".length, end));
}

function fullSchema0059Block(): string {
  const sql = read(FULL_SCHEMA);
  const start = sql.indexOf(BLOCK_BEGIN);
  expect(start).toBeGreaterThan(0);
  const end = sql.indexOf(BLOCK_END, start);
  expect(end).toBeGreaterThan(start);
  const lines = sql.slice(start + BLOCK_BEGIN.length, end).split("\n");
  while (
    lines.length > 0 &&
    (!lines[0].trim() || lines[0].startsWith("-- ===="))
  ) {
    lines.shift();
  }
  while (
    lines.length > 0 &&
    (!lines[lines.length - 1].trim() || lines[lines.length - 1].startsWith("-- ===="))
  ) {
    lines.pop();
  }
  return lines.join("\n");
}

describe("broad_region allowlist", () => {
  it("is identical in the SQL gate and BROAD_REGIONS", () => {
    expect(sqlRegions()).toEqual([...BROAD_REGIONS]);
  });
});

describe("0059 country region allowlist", () => {
  it("matches PUBLISHABLE_REGIONS in preview_leak_findings", () => {
    expect(broadRegionsFrom0059()).toEqual([...PUBLISHABLE_REGIONS]);
  });

  it("matches PUBLISHABLE_REGIONS in preview_dto_requirements", () => {
    expect(requirementsRegionsFrom0059().sort()).toEqual(
      [...PUBLISHABLE_REGIONS].sort(),
    );
  });

  it("never lists a bucketed country name", () => {
    const sqlArrays = [broadRegionsFrom0059(), requirementsRegionsFrom0059()];
    const bucketedNames = [
      ...new Set([...LOW_VOLUME_COUNTRIES].map((code) => BUCKETED_COUNTRY_NAMES[code])),
    ];

    expect(bucketedNames.every(Boolean)).toBe(true);
    for (const name of bucketedNames) {
      expect(sqlArrays[0]).not.toContain(name);
      expect(sqlArrays[1]).not.toContain(name);
      expect(PUBLISHABLE_REGIONS).not.toContain(name);
    }
  });

  it("buckets low-volume countries through countryRegion", () => {
    expect(countryRegion("MT")).toBe("Europe (other)");
    expect(countryRegion("LU")).toBe("Europe (other)");
    expect(countryRegion("IT")).toBe("Europe (other)");
    expect(countryRegion("DE")).toBe("Germany");
  });

  it("keeps the bundled 0059 block identical to the migration", () => {
    expect(fullSchema0059Block()).toBe(read(MIGRATION_0059).trimEnd());
  });
});
