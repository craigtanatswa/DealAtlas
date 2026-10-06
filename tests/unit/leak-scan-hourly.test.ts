import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deliverFindings } from "@/lib/leak-scan/alert";
import { runDbPass } from "@/lib/leak-scan/db-pass";
import { runHttpPass } from "@/lib/leak-scan/http-pass";
import { createReadonlyClient, type ReadonlyFilter } from "@/lib/leak-scan/readonly-client";
import { sourceManifestTokens } from "@/lib/leak-scan/tokens";

const ROOT = path.resolve(__dirname, "../..");
const DEAL_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_TITLE = "Zarqwell Harbour Dredging Notice";

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTs(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function chain(data: unknown[]): ReadonlyFilter<unknown[]> {
  const result = { data, error: null };
  const filter = {
    eq: () => filter,
    order: () => filter,
    limit: () => filter,
    then: (
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return filter as unknown as ReadonlyFilter<unknown[]>;
}

describe("hourly leak scan", () => {
  it("alerts on a HIGH fixture and does not write", async () => {
    const writes: string[] = [];
    const raw = {
      from(table: string) {
        return {
          select() {
            if (table === "deal_previews") {
              return chain([
                {
                  deal_id: DEAL_ID,
                  slug: "road-maintenance-deadbeef",
                  preview_title: SOURCE_TITLE,
                  preview_summary: "A public organisation is seeking facilities management.",
                  requirements_preview: [],
                  relevance_tags: [],
                  broad_region: "Nationwide",
                  is_published: true,
                  unpublished_by_admin: false,
                },
              ]);
            }
            if (table === "deals") {
              return chain([
                {
                  id: DEAL_ID,
                  primary_source_id: null,
                  source_title: SOURCE_TITLE,
                  source_description: null,
                  ocid: null,
                  reference: null,
                  external_primary_id: null,
                  source_url: null,
                  application_url: null,
                  buyer_organization_id: null,
                  exact_value_text: null,
                  value_min_ex_vat: null,
                  value_max_ex_vat: null,
                  submission_deadline: null,
                  enquiry_deadline: null,
                  first_published_at: null,
                  award_decision_date: null,
                  contract_start_date: null,
                  contract_end_date: null,
                  extension_end_date: null,
                  next_procurement_date: null,
                  estimated_renewal_date: null,
                  exact_location_text: null,
                },
              ]);
            }
            return chain([]);
          },
          insert() {
            writes.push("insert");
          },
          update() {
            writes.push("update");
          },
          upsert() {
            writes.push("upsert");
          },
          delete() {
            writes.push("delete");
          },
          rpc() {
            writes.push("rpc");
          },
        };
      },
    };
    const client = createReadonlyClient(raw);
    expect(() => (client.from("deals") as { insert?: () => void }).insert?.()).toThrow(/select-only/);
    const result = await runDbPass(client, { limit: 5 });
    expect(writes).toEqual([]);
    expect(result.failed).toBe(1);
    expect(result.findings.some((finding) => finding.code === "TITLE_SIMILARITY")).toBe(true);
    expect(result.findings.every((finding) => finding.dealId === DEAL_ID)).toBe(true);

    const sent: string[] = [];
    await deliverFindings(result, {
      async sentry(_message, extra) {
        sent.push(JSON.stringify(extra));
      },
      async email(_subject, text) {
        sent.push(text);
      },
    });
    const blob = sent.join("\n");
    expect(blob).toContain(DEAL_ID);
    expect(blob).toContain("TITLE_SIMILARITY");
    expect(blob).toContain("/deals/road-maintenance-deadbeef");
    expect(blob).not.toContain(SOURCE_TITLE);
    expect(blob).toContain("severity=error");
  });

  it("keeps write methods and the raw client out of the scan modules", () => {
    const banned =
      /\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(|\.rpc\s*\(|createSupabaseAdminClient|@supabase\/supabase-js|createClient\s*\(/;
    const files = listTs(path.join(ROOT, "lib/leak-scan"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(fs.readFileSync(file, "utf8")).not.toMatch(banned);
    }
    const script = read("scripts/leak-scan.ts");
    expect(script).toContain("createReadonlyClient");
    expect(script).not.toMatch(/\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(|\.rpc\s*\(/);
  });

  it("greps public pages with the harness token rules and skips old slugs when the database pass is absent", async () => {
    const tokens = sourceManifestTokens({
      dealId: DEAL_ID,
      sourceTitle: "unrelated source title that is long enough",
      buyerName: "Northwind Procurement Office",
      ocid: null,
      reference: null,
      externalPrimaryId: null,
      sourceUrl: null,
      buyerEmail: null,
    });
    const fetchImpl = (async (url: string) => {
      const href = String(url);
      const body = href.endsWith("/deals")
        ? "<html>Northwind Procurement Office published this page</html>"
        : "<html></html>";
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const result = await runHttpPass({
      origin: "https://www.dealatlas.uk",
      fetchImpl,
      tokens,
      legacySlugs: null,
    });
    expect(result.oldSlugs).toEqual({ status: "skipped", reason: "db_pass_unavailable" });
    expect(result.findings).toEqual([
      expect.objectContaining({ dealId: DEAL_ID, code: "BUYER_NAME", path: "/deals" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("published this page");
  });

  it("flags an old slug that is still served", async () => {
    const fetchImpl = (async (url: string) => {
      const status = String(url).includes("legacy-notice-aaaaaaaa") ? 200 : 200;
      return new Response("", { status, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const result = await runHttpPass({
      origin: "https://example.test",
      fetchImpl,
      tokens: [],
      legacySlugs: [{ dealId: DEAL_ID, slug: "legacy-notice-aaaaaaaa" }],
    });
    expect(result.oldSlugs).toEqual({ status: "checked", count: 1 });
    expect(result.findings).toContainEqual({
      dealId: DEAL_ID,
      code: "OLD_SLUG",
      path: "/deals/legacy-notice-aaaaaaaa",
    });
  });

  it("describes a read-only workflow that leaves the scheduled workflow alone", () => {
    const workflow = read(".github/workflows/leak-scan.yml");
    const scheduled = read(".github/workflows/scheduled-jobs.yml");
    expect(workflow).toContain("cron: \"23 * * * *\"");
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("dealatlas-leak-scan");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("timeout-minutes: 20");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("environment: leak-scan");
    expect(workflow).toContain("failure() || cancelled()");
    expect(workflow).not.toContain("scheduled-jobs.yml");
    expect(workflow).not.toMatch(/\b(ingest|previews|rebuild|alerts|renewals)\b/);
    expect(workflow.indexOf("npm ci")).toBeLessThan(workflow.indexOf("SUPABASE_SECRET_KEY"));
    expect(workflow.indexOf("Fetch public pages")).toBeLessThan(workflow.indexOf("RESEND_API_KEY"));
    expect(scheduled).toContain("schedule:");
    expect(scheduled).toContain("npm run job -- --job ingest --due");
  });
});
