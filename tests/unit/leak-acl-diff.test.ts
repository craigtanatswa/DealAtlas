import { describe, expect, it } from "vitest";

import { aclDiff, type Acl } from "../leak/probes/db";

function fn(name: string, anon: boolean, authenticated: boolean): Acl["functions"][string] {
  return { name, anon, authenticated };
}

function acl(functions: Acl["functions"]): Acl {
  return { functions, tables: {}, columns: {}, schemas: {} };
}

describe("phase B ACL diff", () => {
  const before = acl({
    "search_preview_dtos()": fn("search_preview_dtos", true, true),
    "search_deal_previews()": fn("search_deal_previews", true, true),
  });

  it("treats 0020 service-only functions as intended additions", () => {
    const after = acl({
      ...before.functions,
      "preview_slug_is_retired(text)": fn("preview_slug_is_retired", false, false),
      "retire_preview_slug(text)": fn("retire_preview_slug", false, false),
      "maintain_deals_leak_index()": fn("maintain_deals_leak_index", false, false),
      "publish_eligible_previews(integer)": fn("publish_eligible_previews", false, false),
      "unpublish_stale_previews()": fn("unpublish_stale_previews", false, false),
      "search_deal_previews()": fn("search_deal_previews", false, false),
    });
    const diff = aclDiff(before, after);
    expect(diff.unintended).toEqual([]);
    expect(diff.intended).toEqual([
      "function search_deal_previews() anon: true -> false",
      "function search_deal_previews() authenticated: true -> false",
      "preview_slug_is_retired(text): added",
      "retire_preview_slug(text): added",
      "maintain_deals_leak_index(): added",
      "publish_eligible_previews(integer): added",
      "unpublish_stale_previews(): added",
    ]);
  });

  it("rejects a client EXECUTE grant on a new 0020 function", () => {
    const after = acl({
      ...before.functions,
      "preview_slug_is_retired(text)": fn("preview_slug_is_retired", true, false),
    });
    expect(aclDiff(before, after).unintended).toEqual(["preview_slug_is_retired(text): added"]);
  });

  it("rejects an unlisted function and a DTO revoke", () => {
    const after = acl({
      "search_preview_dtos()": fn("search_preview_dtos", false, true),
      "search_deal_previews()": fn("search_deal_previews", true, true),
      "unexpected_helper()": fn("unexpected_helper", false, false),
    });
    expect(aclDiff(before, after).unintended).toEqual([
      "function search_preview_dtos() anon: true -> false",
      "unexpected_helper(): added",
    ]);
  });
});
