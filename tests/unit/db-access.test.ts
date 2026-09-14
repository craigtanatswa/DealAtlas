import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("typed data-access boundaries", () => {
  it("keeps public preview queries on deal_previews with explicit columns", () => {
    const source = read("lib/db/previews.ts");
    expect(source).toContain('.from("deal_previews")');
    expect(source).toContain("search_deal_previews");
    expect(source).toContain("p_value_band");
    expect(source).toContain("p_deadline_band");
    expect(source).toContain("DEAL_PREVIEW_PUBLIC_SELECT");
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
  });

  it("isolates canonical queries behind server-only", () => {
    const source = read("lib/db/canonical.ts");
    expect(source).toMatch(/import ["']server-only["']/);
    expect(source).toContain('.from("deals")');
    expect(source).toContain('.from("organizations")');
    expect(source).toContain('.from("notices")');
    expect(source).toContain('.from("documents")');
    expect(source).toContain('.from("data_sources")');
    expect(source).toContain("exact_location_text");
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
    expect(read("lib/supabase/admin.ts")).toContain("Database");
    expect(read("lib/supabase/admin.ts")).not.toContain("PublicDatabase");
  });
});
