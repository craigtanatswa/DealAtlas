import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  expandFilterToRawCategories,
  FILTER_TAXONOMY_NAMES,
  mapRawCategoryToFilter,
  rawCategoryAliases,
} from "@/lib/categories/filter-map";
import { DEAL_CATEGORY_SLUGS } from "@/lib/matching/categories";
import { DEAL_CATEGORY_OPTIONS } from "@/lib/search/filters";
import fixture from "./fixtures/published-main-categories-2026-10-27.json";

const ROOT = path.resolve(__dirname, "../..");

describe("published main_category snapshot", () => {
  it("matches the recorded 405 published deals across 38 raw categories", () => {
    expect(fixture.total_published).toBe(405);
    expect(fixture.categories).toHaveLength(38);
    expect(
      fixture.categories.reduce((sum, row) => sum + row.count, 0),
    ).toBe(405);
  });
});

describe("raw main_category to filter taxonomy", () => {
  it("maps every published raw category to one of the 13 filter names", () => {
    for (const row of fixture.categories) {
      const mapped = mapRawCategoryToFilter(row.main_category);
      expect(mapped, row.main_category).not.toBeNull();
      expect(DEAL_CATEGORY_OPTIONS).toContain(mapped);
    }
  });

  it("covers 405/405 published deals, up from 168 exact-match deals", () => {
    const exactFilterNames = new Set<string>(DEAL_CATEGORY_OPTIONS);
    let before = 0;
    let after = 0;
    for (const row of fixture.categories) {
      if (exactFilterNames.has(row.main_category)) {
        before += row.count;
      }
      if (mapRawCategoryToFilter(row.main_category)) {
        after += row.count;
      }
    }
    // Before the map only the 10 raw names that already matched a filter
    // label were reachable; the other 28 raw names were orphaned.
    expect(before).toBe(168);
    expect(after).toBe(405);
  });
});

describe("filter expansion", () => {
  const energyRaws = ["Energy", "Energy & Utilities", "Water and Wastewater"];

  it("expands a filter name to every raw value that maps to it", () => {
    expect(expandFilterToRawCategories("Energy & Utilities")).toEqual(energyRaws);
  });

  it("expands a catalog slug to the same raw values", () => {
    expect(expandFilterToRawCategories("energy-utilities")).toEqual(energyRaws);
  });

  it("expands a raw value through its filter taxonomy", () => {
    expect(expandFilterToRawCategories("Energy")).toEqual(energyRaws);
  });

  it("returns the trimmed input for unknown values so exact matching survives", () => {
    expect(expandFilterToRawCategories("  Not A Category  ")).toEqual([
      "Not A Category",
    ]);
    expect(expandFilterToRawCategories("")).toEqual([]);
    expect(expandFilterToRawCategories(null)).toEqual([]);
  });
});

describe("category alias redirects", () => {
  const aliases = rawCategoryAliases();

  it("includes raw-name aliases for energy and water", () => {
    expect(aliases).toEqual(
      expect.arrayContaining([
        { fromSlug: "energy", toSlug: "energy-utilities", toName: "Energy & Utilities" },
        {
          fromSlug: "water-and-wastewater",
          toSlug: "energy-utilities",
          toName: "Energy & Utilities",
        },
      ]),
    );
  });

  it("never redirects an existing catalog slug away from itself", () => {
    const catalogSlugs = new Set<string>(DEAL_CATEGORY_SLUGS);
    for (const alias of aliases) {
      expect(catalogSlugs.has(alias.fromSlug)).toBe(false);
      expect(alias.fromSlug).not.toBe(alias.toSlug);
    }
  });
});

describe("filter map module boundary", () => {
  it("contains no buyer, notice, source URL or source-portal strings", () => {
    const source = fs
      .readFileSync(path.join(ROOT, "lib/categories/filter-map.ts"), "utf8")
      .toLowerCase();
    for (const forbidden of [
      "buyer",
      "notice",
      "source_url",
      "contractsfinder",
      "findatinender",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("exposes the unchanged 13 filter taxonomy names", () => {
    expect(FILTER_TAXONOMY_NAMES).toEqual(DEAL_CATEGORY_OPTIONS);
  });
});
