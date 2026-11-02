import { describe, expect, it } from "vitest";

import type { Assertion } from "../leak/lib/probe";
import { dtoAssertions, type EnumSets } from "../leak/probes/common";

const KEYS = ["slug", "broad_region"];
const ENUMS: EnumSets = {
  deal_type: new Set<string>(),
  buyer_sector: new Set<string>(),
  deal_stage: new Set<string>(),
  deal_status: new Set<string>(),
};

function assertionsFor(broadRegion: unknown): Assertion[] {
  return dtoAssertions(
    [{ slug: "probe-row", broad_region: broadRegion }],
    KEYS,
    ENUMS,
    { role: "anon", label: "regions" },
  );
}

function valueDomains(broadRegion: unknown): Assertion {
  const assertions = assertionsFor(broadRegion);
  expect(assertions.find((a) => a.id === "regions:exact_keys")?.pass).toBe(true);
  const assertion = assertions.find((a) => a.id === "regions:value_domains");
  expect(assertion).toBeDefined();
  return assertion!;
}

describe("leak probe broad_region allowlist", () => {
  it.each(["Germany", "Europe (other)", "London", null])("accepts %s", (region) => {
    const assertion = valueDomains(region);
    expect(assertion.pass).toBe(true);
    expect(assertion.actual).toBeUndefined();
  });

  it.each(["Malta", "Manchester"])("rejects %s and reports the value", (region) => {
    const assertions = assertionsFor(region);
    expect(assertions.filter((a) => !a.pass).map((a) => a.id)).toEqual(["regions:value_domains"]);
    const assertion = valueDomains(region);
    expect(assertion.pass).toBe(false);
    expect(assertion.actual).toEqual([`probe-row.broad_region=${JSON.stringify(region)}`]);
  });
});
