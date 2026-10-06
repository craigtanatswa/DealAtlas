import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { alertDepsFromEnv, deliverCrash, deliverFindings, deliverIncomplete } from "@/lib/leak-scan/alert";
import { runDbPass } from "@/lib/leak-scan/db-pass";
import { rotatingSample, runHttpPass } from "@/lib/leak-scan/http-pass";
import { createReadonlyClient, type ReadonlyFilter } from "@/lib/leak-scan/readonly-client";
import { sourceManifestTokens, unionStrongTokens } from "@/lib/leak-scan/tokens";

const ROOT = path.resolve(__dirname, "../..");
const DEAL_ID = "11111111-1111-4111-8111-111111111111";
const HELD_ID = "22222222-2222-4222-8222-222222222222";
const PUBLISHED_SLUG = "road-maintenance-deadbeef";
const HELD_SLUG = "held-legacy-source-slug-zz99zz99";
const SOURCE_TITLE = "Zarqwell Harbour Dredging Notice";
const HELD_TITLE = "Quillon Bridge Refurbishment Notice";
const OWN_SLUG = "own-buyer-page-abcd1234";
const OTHER_SLUG = "other-buyer-page-9999aaaa";
const BUYER = "Northwind Procurement Office";

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

function dealRow(id: string, title: string) {
  return {
    id,
    primary_source_id: null,
    source_title: title,
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
  };
}

function previewQuery(rows: Array<Record<string, unknown>>) {
  const eqs: Array<[string, unknown]> = [];
  let gtValue: string | null = null;
  let limit = rows.length;
  const filter = {
    eq(column: string, value: unknown) {
      eqs.push([column, value]);
      return filter;
    },
    in(column: string, values: readonly unknown[]) {
      eqs.push([column, values]);
      return filter;
    },
    gt(column: string, value: string) {
      if (column === "deal_id") gtValue = value;
      return filter;
    },
    order() {
      return filter;
    },
    limit(count: number) {
      limit = count;
      return filter;
    },
    then(
      onFulfilled: (value: { data: unknown[]; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      let matched = rows.filter((row) =>
        eqs.every(([column, value]) => (Array.isArray(value) ? value.includes(row[column]) : row[column] === value)),
      );
      matched = [...matched].sort((a, b) => String(a.deal_id).localeCompare(String(b.deal_id)));
      if (gtValue) matched = matched.filter((row) => String(row.deal_id) > gtValue!);
      return Promise.resolve({ data: matched.slice(0, limit), error: null }).then(onFulfilled, onRejected);
    },
  };
  return filter as unknown as ReadonlyFilter<unknown[]>;
}

describe("hourly leak scan", () => {
  it("keeps finding detail out of stdout and Sentry, including held slugs", async () => {
    const writes: string[] = [];
    const previews = [
      {
        deal_id: DEAL_ID,
        slug: PUBLISHED_SLUG,
        preview_title: SOURCE_TITLE,
        preview_summary: "A public organisation is seeking facilities management.",
        requirements_preview: [],
        relevance_tags: [],
        broad_region: "Nationwide",
        is_published: true,
        unpublished_by_admin: false,
      },
      {
        deal_id: HELD_ID,
        slug: HELD_SLUG,
        preview_title: HELD_TITLE,
        preview_summary: "A public organisation is seeking facilities management.",
        requirements_preview: [],
        relevance_tags: [],
        broad_region: "Nationwide",
        is_published: false,
        unpublished_by_admin: true,
      },
    ];
    const deals = [dealRow(DEAL_ID, SOURCE_TITLE), dealRow(HELD_ID, HELD_TITLE)];
    const raw = {
      headers: { apikey: "service-key-should-not-leak" },
      from(table: string) {
        return {
          select() {
            if (table === "deal_previews") return previewQuery(previews);
            if (table === "deals") return previewQuery(deals);
            return previewQuery([]);
          },
          insert() {
            writes.push("insert");
          },
        };
      },
    };
    const logs: string[] = [];
    const originals = { log: console.log, warn: console.warn, error: console.error };
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    console.warn = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const result = await runDbPass(createReadonlyClient(raw), { includeHeld: true, batchSize: 1 });
      expect(writes).toEqual([]);
      expect(result.scanned).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.findings.some((finding) => finding.held && finding.path === null)).toBe(true);
      await deliverFindings(
        result,
        alertDepsFromEnv(
          {
            SENTRY_DSN: "https://abc123def456@o1.ingest.sentry.io/99",
            RESEND_API_KEY: "re_test",
            DEALATLAS_EMAIL_FROM: "alerts@dealatlas.uk",
            LEAK_ALERT_EMAIL_TO: "craig@example.com",
          },
          fetchImpl,
        ),
      );
    } finally {
      console.log = originals.log;
      console.warn = originals.warn;
      console.error = originals.error;
    }

    const sentryCalls = calls.filter((call) => call.url.includes("sentry"));
    expect(sentryCalls.length).toBeGreaterThan(0);
    const sentry = sentryCalls.map((call) => call.body).join("\n");
    const email = calls.filter((call) => call.url.includes("resend")).map((call) => call.body).join("\n");
    const stdout = logs.join("\n");
    for (const secret of [PUBLISHED_SLUG, HELD_SLUG, "/deals/", DEAL_ID, HELD_ID, SOURCE_TITLE, HELD_TITLE]) {
      expect(stdout).not.toContain(secret);
      expect(sentry).not.toContain(secret);
    }
    expect(email).toContain(DEAL_ID);
    expect(email).toContain(`/deals/${PUBLISHED_SLUG}`);
    expect(email).toContain(HELD_ID);
    expect(email).toContain("TITLE_SIMILARITY");
    expect(email).not.toContain(HELD_SLUG);
    expect(email).not.toContain(SOURCE_TITLE);
    expect(email).not.toContain(HELD_TITLE);
  });

  it("sends the alert and the crash notice by email when Sentry is unset", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const deps = alertDepsFromEnv(
      {
        RESEND_API_KEY: "re_test",
        DEALATLAS_EMAIL_FROM: "alerts@dealatlas.uk",
        LEAK_ALERT_EMAIL_TO: "craig@example.com",
      },
      fetchImpl,
    );
    const finding = {
      dealId: DEAL_ID,
      code: "TITLE_SIMILARITY",
      path: `/deals/${PUBLISHED_SLUG}`,
      held: false,
      pass: "db" as const,
    };
    await deliverFindings({ scanned: 1, failed: 1, findings: [finding] }, deps);
    await deliverCrash(deps);
    expect(calls.length).toBe(2);
    expect(calls.every((url) => url.includes("api.resend.com"))).toBe(true);
  });

  it("fails the process path when findings or a crash cannot be emailed", async () => {
    const deps = alertDepsFromEnv({});
    const finding = {
      dealId: DEAL_ID,
      code: "TITLE_SIMILARITY",
      path: `/deals/${PUBLISHED_SLUG}`,
      held: false,
      pass: "db" as const,
    };
    await expect(deliverFindings({ scanned: 1, failed: 1, findings: [finding] }, deps)).rejects.toThrow(/email/);
    await expect(deliverCrash(deps)).rejects.toThrow(/email/);
    await expect(deliverFindings({ scanned: 4, failed: 0, findings: [] }, deps)).resolves.toMatchObject({ sent: false });
    const failedSend = alertDepsFromEnv(
      {
        RESEND_API_KEY: "re_test",
        DEALATLAS_EMAIL_FROM: "alerts@dealatlas.uk",
        LEAK_ALERT_EMAIL_TO: "craig@example.com",
      },
      (async () => new Response("no", { status: 500 })) as typeof fetch,
    );
    await expect(deliverFindings({ scanned: 1, failed: 1, findings: [finding] }, failedSend)).rejects.toThrow(/email/);
  });

  it("exposes only a frozen select surface", () => {
    const secret = "service-key-should-not-leak";
    const query = {
      headers: { apikey: secret },
      insert() {
        return secret;
      },
      update() {
        return secret;
      },
      delete() {
        return secret;
      },
      upsert() {
        return secret;
      },
      url: secret,
      method: "POST",
      eq() {
        return query;
      },
      in() {
        return query;
      },
      gt() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      then(onFulfilled?: ((value: { data: unknown[]; error: null }) => unknown) | null) {
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      },
    };
    const raw = {
      headers: { apikey: secret },
      rest: { url: secret },
      auth: { key: secret },
      url: secret,
      method: "POST",
      insert() {
        return secret;
      },
      update() {
        return secret;
      },
      delete() {
        return secret;
      },
      upsert() {
        return secret;
      },
      rpc() {
        return secret;
      },
      from() {
        return {
          headers: { apikey: secret },
          select() {
            return query;
          },
        };
      },
    };
    const client = createReadonlyClient(raw);
    const selected = client.from("deals").select("id");
    const blocked = ["insert", "update", "delete", "upsert", "url", "method"] as const;
    for (const value of [client, client.from("deals"), selected]) {
      expect((value as { headers?: unknown }).headers).toBeUndefined();
      expect((value as { rest?: unknown }).rest).toBeUndefined();
      expect((value as { auth?: unknown }).auth).toBeUndefined();
      expect((value as { rpc?: unknown }).rpc).toBeUndefined();
      for (const key of blocked) {
        expect((value as unknown as Record<string, unknown>)[key]).toBeUndefined();
      }
    }
    expect(JSON.stringify(client)).not.toContain(secret);
    expect(JSON.stringify(selected)).not.toContain(secret);
    expect(Object.isFrozen(client)).toBe(true);
    expect(() => {
      (client as { from: unknown }).from = () => null;
    }).toThrow(TypeError);
    expect(() => {
      (selected as { eq: unknown }).eq = () => null;
    }).toThrow(TypeError);
  });

  it("alerts when a deal page contains its own buyer name or another deal's buyer name", async () => {
    const tokens = sourceManifestTokens({
      dealId: DEAL_ID,
      sourceTitle: "unrelated source title that is long enough",
      buyerName: BUYER,
      ocid: null,
      reference: null,
      externalPrimaryId: null,
      sourceUrl: null,
      buyerEmail: null,
    });
    const origin = "https://www.dealatlas.uk";
    const fetchImpl = (async (url: string) => {
      const href = String(url);
      let body = "<html></html>";
      if (href.endsWith("/deals/sitemap.xml")) body = `<loc>${origin}/deals/sitemap/0.xml</loc>`;
      if (href.includes("/deals/sitemap/0.xml")) {
        body = `<loc>${origin}/deals/${OWN_SLUG}</loc><loc>${origin}/deals/${OTHER_SLUG}</loc>`;
      }
      if (href.includes(`/deals/${OWN_SLUG}`) && !href.includes("_rsc")) body = `<html>${BUYER}</html>`;
      if (href.includes(`/deals/${OTHER_SLUG}`)) body = `<html>${BUYER}</html>`;
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const result = await runHttpPass({
      origin,
      fetchImpl,
      dealTokens: [{ dealId: DEAL_ID, slug: OWN_SLUG, tokens }],
      legacySlugs: null,
      sampleSeed: 0,
    });
    expect(result.findings.filter((finding) => finding.code === "BUYER_NAME")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dealId: DEAL_ID, path: `/deals/${OWN_SLUG}` }),
        expect.objectContaining({ dealId: DEAL_ID, path: `/deals/${OTHER_SLUG}` }),
      ]),
    );
    expect(JSON.stringify(result.findings)).not.toContain(BUYER);
  });

  it("alerts when a buyer name is planted on a listing page", async () => {
    const tokens = sourceManifestTokens({
      dealId: DEAL_ID,
      sourceTitle: "unrelated source title that is long enough",
      buyerName: BUYER,
      ocid: null,
      reference: null,
      externalPrimaryId: null,
      sourceUrl: null,
      buyerEmail: null,
    });
    const origin = "https://www.dealatlas.uk";
    const fetchImpl = (async (url: string) => {
      const href = String(url);
      const body = href.endsWith("/deals") || href.includes("/api/search") ? `<html>${BUYER}</html>` : "<html></html>";
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const result = await runHttpPass({
      origin,
      fetchImpl,
      dealTokens: [{ dealId: DEAL_ID, slug: OWN_SLUG, tokens }],
      legacySlugs: [],
      sampleSeed: 0,
    });
    expect(result.findings.filter((finding) => finding.code === "BUYER_NAME")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dealId: DEAL_ID, path: "/deals" }),
        expect.objectContaining({ dealId: DEAL_ID, path: "/api/search" }),
      ]),
    );
    expect(JSON.stringify(result.findings)).not.toContain(BUYER);
  });

  it("does not alert on DealAtlas contact text", async () => {
    const footer =
      "support@dealatlas.uk info@dealatlas.uk +44 20 7946 0991 www.dealatlas.uk DEALATLAS-WEB-100234";
    const origin = "https://www.dealatlas.uk";
    const fetchImpl = (async (url: string) => {
      const href = String(url);
      let body = "<html></html>";
      if (href.endsWith("/") || href.endsWith("/deals") || href.includes("/api/search")) body = `<html>${footer}</html>`;
      if (href.endsWith("/sitemap.xml")) body = "<html>auditor@foreign.example dept.service.gov.uk</html>";
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const result = await runHttpPass({ origin, fetchImpl, dealTokens: [], legacySlugs: [], sampleSeed: 0 });
    const noisy = new Set(["email", "uk_phone", "gov_domain", "reference_shape"]);
    for (const path of ["/", "/deals", "/api/search"]) {
      expect(result.findings.filter((finding) => finding.path === path && noisy.has(finding.code))).toEqual([]);
    }
    expect(result.findings).toContainEqual(expect.objectContaining({ code: "email", path: "/sitemap.xml" }));
    expect(result.findings).toContainEqual(expect.objectContaining({ code: "gov_domain", path: "/sitemap.xml" }));
  });

  it("keeps generic names and source titles out of the strong-token union", () => {
    const tokens = sourceManifestTokens({
      dealId: DEAL_ID,
      sourceTitle: "Very Specific Harbour Dredging Notice",
      buyerName: "The Council",
      ocid: null,
      reference: null,
      externalPrimaryId: null,
      sourceUrl: null,
      buyerEmail: null,
      sourceName: "Public Services",
    });
    expect(unionStrongTokens([{ tokens }])).toEqual([]);
    const strong = sourceManifestTokens({
      dealId: DEAL_ID,
      sourceTitle: "unrelated source title that is long enough",
      buyerName: BUYER,
      ocid: null,
      reference: null,
      externalPrimaryId: null,
      sourceUrl: null,
      buyerEmail: null,
    });
    expect(unionStrongTokens([{ tokens: strong }]).map((entry) => entry.class)).toEqual(["BUYER_NAME"]);
  });

  it("stops the database pass at the time budget and emails counts only", async () => {
    const secondId = "33333333-3333-4333-8333-333333333333";
    const previews = [DEAL_ID, secondId].map((id) => ({
      deal_id: id,
      slug: id === DEAL_ID ? PUBLISHED_SLUG : "second-published-page-cccc1111",
      preview_title: "Public facilities notice",
      preview_summary: "A public organisation is seeking facilities management.",
      requirements_preview: [],
      relevance_tags: [],
      broad_region: "Nationwide",
      is_published: true,
      unpublished_by_admin: false,
    }));
    const deals = [dealRow(DEAL_ID, SOURCE_TITLE), dealRow(secondId, "Other Harbour Works Notice")];
    const raw = {
      from(table: string) {
        return {
          select() {
            if (table === "deal_previews") return previewQuery(previews);
            if (table === "deals") return previewQuery(deals);
            return previewQuery([]);
          },
        };
      },
    };
    let ticks = 0;
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    let result: Awaited<ReturnType<typeof runDbPass>>;
    try {
      result = await runDbPass(createReadonlyClient(raw), {
        batchSize: 1,
        now: () => {
          ticks += 1;
          return ticks === 1 ? 0 : 16 * 60 * 1000;
        },
      });
    } finally {
      console.log = original;
    }
    expect(result.incomplete).toBe(true);
    expect(result.scanned).toBe(1);
    const emails: string[] = [];
    await deliverIncomplete(result, {
      sentry: async () => {},
      email: async (_subject, text) => {
        emails.push(text);
      },
    });
    expect(emails[0]).toContain("incomplete=1");
    expect(emails[0]).toContain("scanned=1");
    expect(emails[0]).not.toContain(DEAL_ID);
    expect(emails[0]).not.toContain(secondId);
    const stdout = logs.join("\n");
    expect(stdout).toContain('"batch_count"');
    expect(stdout).not.toContain('"batches"');
    expect(stdout).not.toContain(DEAL_ID);
    expect(stdout).not.toContain(secondId);
  });

  it("rotates the public sample and still skips old slugs without a database pass", () => {
    expect(rotatingSample(["a", "b", "c", "d"], 2, 1)).toEqual({ picked: ["b", "c"], offset: 1 });
    expect(rotatingSample(["a", "b"], 15, 3).offset).toBe(0);
  });

  it("flags an old slug that is still served", async () => {
    const fetchImpl = (async () => new Response("", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
    const result = await runHttpPass({
      origin: "https://example.test",
      fetchImpl,
      dealTokens: [],
      legacySlugs: [{ dealId: DEAL_ID, slug: "legacy-notice-aaaaaaaa" }],
    });
    expect(result.oldSlugs).toEqual({ status: "checked", count: 1 });
    expect(result.findings).toContainEqual({
      dealId: DEAL_ID,
      code: "OLD_SLUG",
      path: "/deals/legacy-notice-aaaaaaaa",
      held: false,
      pass: "http",
    });
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

  it("describes a read-only workflow that leaves the scheduled workflow alone", () => {
    const workflow = read(".github/workflows/leak-scan.yml");
    const scheduled = read(".github/workflows/scheduled-jobs.yml");
    expect(workflow).toContain('cron: "23 * * * *"');
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("dealatlas-leak-scan");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("timeout-minutes: 20");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("environment: leak-scan");
    expect(workflow).toContain("failure() || cancelled()");
    expect(workflow).toContain("if: always()");
    expect(workflow).not.toContain("scheduled-jobs.yml");
    expect(workflow).not.toContain("actions/upload-artifact");
    expect(workflow).not.toMatch(/\b(ingest|previews|rebuild|alerts|renewals)\b/);
    expect(workflow.indexOf("npm ci")).toBeLessThan(workflow.indexOf("SUPABASE_SECRET_KEY"));
    const fetchAt = workflow.indexOf("- name: Fetch public pages");
    const notifyAt = workflow.indexOf("- name: Notify\n");
    expect(fetchAt).toBeGreaterThan(workflow.indexOf("RESEND_API_KEY"));
    expect(notifyAt).toBeGreaterThan(fetchAt);
    expect(workflow.slice(fetchAt, notifyAt)).not.toMatch(
      /RESEND_API_KEY|SUPABASE_SECRET_KEY|SENTRY_DSN|DEALATLAS_EMAIL_FROM|LEAK_ALERT_EMAIL_TO/,
    );
    expect(scheduled).toContain("schedule:");
    expect(scheduled).toContain("npm run job -- --job ingest --due");
    const waivers = JSON.parse(read("tests/leak/waivers.json")) as {
      waivers: Array<{ finding: string; reason: string; follow_up?: string }>;
    };
    const rest13 = waivers.waivers.find((waiver) => waiver.finding === "REST-13");
    expect(rest13?.reason).toContain("issue #3");
    expect(rest13?.follow_up).toContain("/issues/3");
  });
});
