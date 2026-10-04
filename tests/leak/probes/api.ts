/** App API, signed-in free views, alerts (01/02) and Pro positive controls (spec 5.6-5.8, 5.12). */
import type { Assertion, Ctx, ProbeOutcome } from "../lib/probe";
import { eq, ok, slugsIn, sorted } from "../lib/probe";
import type { Role } from "../lib/scan";
import {
  FREE_ALERT_DTO_KEYS,
  FREE_ROLES,
  HELD_ROWS,
  NON_PRO_ROLES,
  PUBLIC_PREVIEW_DTO_KEYS,
  PUB_ROWS,
  heldRows,
  isNoindex,
  pageMeta,
  pubSlugs,
} from "./common";
import { isRedirectToLogin, previewTitles, searchQueries } from "./web";

type SearchJson = { items?: Array<Record<string, unknown>>; total?: number; page?: number; pageSize?: number; filters?: unknown };

function searchSlugs(json: unknown): string[] {
  return sorted(((json as SearchJson)?.items ?? []).map((i) => String(i.slug)));
}

function differential(o: ProbeOutcome): Assertion[] {
  if (!o.control) return [ok("control_sent", false, "no control request")];
  const a = o.json as SearchJson;
  const b = o.control.json as SearchJson;
  return [
    eq("slugs_equal_control", searchSlugs(b), searchSlugs(a)),
    eq("total_equals_control", b?.total ?? null, a?.total ?? null),
  ];
}

/** B-row combos: "<generic preview word of row X> <source token of row X>". */
const ROW_COMBOS: Array<[string, string]> = [
  ["B1", "grounds Zarqwell"],
  ["B2", "facilities Vantrexo"],
  ["B3", "highway Brindlewick"],
  ["B4", "support Kestrovane"],
  ["B5", "fleet Quellmoor"],
  ["B6", "catering Zarqwell"],
];

const OPERATOR_TOKENS = ["Zarqwell", "Quellmoor", "Vantrexo", "Delta eSourcing", "ZQ/PROC/8812"];

export async function apiProbes(ctx: Ctx, roles: Role[] = NON_PRO_ROLES): Promise<void> {
  const pub = pubSlugs(ctx);
  const queries = searchQueries(ctx);
  await Promise.all(
    roles.map(async (role) => {
      const jobs: Array<Promise<unknown>> = [];
      // API-01: page through at limit 20 and 50.
      for (const limit of [20, 50]) {
        jobs.push(
          (async () => {
            const union = new Set<string>();
            let total: number | null = null;
            for (let page = 1; page <= 10; page += 1) {
              const o = await ctx.run({
                id: "API-01",
                instance: `limit=${limit}&page=${page}`,
                role,
                req: { path: "/api/search", query: [["limit", String(limit)], ["page", String(page)]] },
                status: [200],
                check: (o) => {
                  const json = o.json as SearchJson;
                  const items = json?.items ?? [];
                  const badItems = items.filter(
                    (i) => JSON.stringify(Object.keys(i).sort()) !== JSON.stringify([...PUBLIC_PREVIEW_DTO_KEYS].sort()),
                  );
                  return [
                    eq("top_level_keys", ["filters", "items", "page", "pageSize", "total"], Object.keys(json ?? {}).sort()),
                    ok("item_keys_exact", badItems.length === 0, badItems.slice(0, 2).map((i) => Object.keys(i))),
                    eq("total", 12, json?.total),
                  ];
                },
              });
              const json = o.json as SearchJson;
              total = json?.total ?? total;
              const slugs = searchSlugs(json);
              slugs.forEach((s) => union.add(s));
              if (slugs.length === 0 || page * limit >= (json?.total ?? 0)) break;
            }
            ctx.derive({
              id: "API-01",
              instance: `slug-union@limit=${limit}`,
              role,
              assertions: [eq("slug_union_is_PUB", sorted(pub), sorted(union)), eq("total", 12, total)],
            });
          })(),
        );
      }
      // API-02: search differential against the control.
      for (const q of queries) {
        jobs.push(
          ctx.run({ id: "API-02", instance: `q=${q}`, role, req: { path: "/api/search", query: [["q", q]] }, status: [200], check: differential }),
        );
      }
      for (const [rowId, q] of ROW_COMBOS) {
        jobs.push(
          ctx.run({ id: "API-02", instance: `${rowId}:${q}`, role, req: { path: "/api/search", query: [["q", q]] }, status: [200], check: differential }),
        );
      }
      // API-03: phrase and operator forms.
      for (const token of OPERATOR_TOKENS) {
        for (const form of [`"${token}"`, `grounds OR ${token}`, `grounds -${token}`, `${token}*`]) {
          jobs.push(
            ctx.run({ id: "API-03", instance: form, role, req: { path: "/api/search", query: [["q", form]] }, status: [200], check: differential }),
          );
        }
      }
      // API-04: token values in filters.
      for (const [param, value] of [
        ["category", "Zarqwell"],
        ["region", "Quellmoor"],
        ["valueBand", "£1,234,567"],
        ["deadlineBand", "17 November 2031"],
      ]) {
        jobs.push(
          ctx.run({
            id: "API-04",
            instance: `${param}=${value}`,
            role,
            req: { path: "/api/search", query: [[param, value]] },
            status: [200],
            check: (o) => [eq("total", 0, (o.json as SearchJson)?.total)],
          }),
        );
      }
      // API-05: protected detail API.
      for (const rowId of ["B1", "A1", "C1", "D1"]) {
        jobs.push(
          ctx.run({
            id: "API-05",
            instance: rowId,
            role,
            req: { path: `/api/deals/${ctx.row(rowId).deal_id}` },
            status: role === "anon" ? [401] : [403],
          }),
        );
      }
      // API-06: intelligence APIs.
      for (const path of [
        "/api/buyers",
        `/api/buyers/${ctx.manifest.orgs.O1}`,
        "/api/suppliers",
        `/api/suppliers/${ctx.manifest.orgs.O2}`,
        "/api/contracts",
        "/api/renewals",
      ]) {
        jobs.push(
          ctx.run({
            id: "API-06",
            instance: path,
            role,
            req: { path },
            status: role === "anon" ? [401] : (s) => s === 401 || s === 403 || s === 200 || s === 402,
            check: (o) => (role === "anon" ? [] : [ok("no_data_rows", noDataRows(o), o.final.body.slice(0, 300))]),
          }),
        );
      }
      // API-07: exports and billing.
      jobs.push(
        ctx.run({
          id: "API-07",
          instance: "GET /api/exports",
          role,
          req: { path: "/api/exports" },
          status: role === "anon" ? [401] : (s) => s < 500,
          check: (o) => [ok("no_export_rows", !/text\/csv/.test(o.final.contentType), o.final.contentType)],
        }),
        ctx.run({
          id: "API-07",
          instance: "POST /api/exports dealIds:[B1]",
          role,
          req: { method: "POST", path: "/api/exports", json: { dealIds: [ctx.row("B1").deal_id] } },
          status: role === "anon" ? [401] : [403],
          check: (o) => [ok("no_export_rows", !/text\/csv/.test(o.final.contentType), o.final.contentType)],
        }),
      );
      for (const path of ["/api/billing/checkout", "/api/billing/portal"]) {
        jobs.push(
          ctx.run({
            id: "API-07",
            instance: `POST ${path}`,
            role,
            req: { method: "POST", path, json: { planKey: "PRO_MONTHLY" } },
            status: role === "anon" ? [401] : (s) => s >= 400,
            check: (o) => [ok("fails_closed", !/checkout\.dodopayments|customer-portal/.test(o.final.body), o.final.body.slice(0, 200))],
          }),
        );
      }
      // API-08
      jobs.push(
        ctx.run({ id: "API-08", instance: "/api/alerts", role, req: { path: "/api/alerts" }, status: role === "anon" ? [401] : [200] }),
        ctx.run({
          id: "API-08",
          instance: "/api/billing/entitlement",
          role,
          req: { path: "/api/billing/entitlement" },
          status: role === "anon" ? [401] : [200],
          check: (o) => (role === "anon" ? [] : [eq("plan", "FREE", (o.json as { plan?: string })?.plan)]),
        }),
        ctx.run({ id: "API-08", instance: "/api/health", role, req: { path: "/api/health" }, status: [200] }),
      );
      await Promise.all(jobs);
    }),
  );
}

function noDataRows(o: ProbeOutcome): boolean {
  if (o.final.status !== 200) return true;
  const json = o.json as Record<string, unknown> | undefined;
  if (!json || typeof json !== "object") return true;
  const arrays = Object.values(json).filter(Array.isArray) as unknown[][];
  return arrays.every((a) => a.length === 0);
}

// ---------------------------------------------------------------------------
// Signed-in free views (5.7)
// ---------------------------------------------------------------------------

const APP_DEAL = /\/app\/deals\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

function appDealIds(text: string): Set<string> {
  return new Set([...text.matchAll(APP_DEAL)].map((m) => m[1]));
}

function resultKeys(text: string): string[] {
  return sorted([...slugsIn(text), ...appDealIds(text)]);
}

export async function appProbes(ctx: Ctx, roles: Role[] = NON_PRO_ROLES): Promise<void> {
  const pub = pubSlugs(ctx);
  const pubIds = new Set(PUB_ROWS.map((r) => ctx.row(r).deal_id));
  const titles = previewTitles(ctx);
  const queries = searchQueries(ctx);
  await Promise.all(
    roles.map(async (role) => {
      const anon = role === "anon";
      const jobs: Array<Promise<unknown>> = [];
      const view = (id: string, instance: string, path: string, extra: Partial<Parameters<Ctx["run"]>[0]> = {}) => {
        const base = { id, instance, role, req: { path, followRedirects: false } };
        if (anon) {
          return ctx.run({ ...base, status: (s: number) => s >= 300 && s < 400, check: (o) => [ok("redirects_to_login", isRedirectToLogin(o), o.final.headers.find(([n]) => n === "location"))] });
        }
        return Promise.all([
          ctx.run({ ...base, status: [200], ...extra }),
          ctx.run({
            ...base,
            id: "RSC-01",
            instance: `${id}:${instance}`,
            req: { ...base.req, rsc: "rsc" as const, followRedirects: true },
            requireRsc: true,
          }),
        ]);
      };
      for (const path of ["/app", "/app/profile", "/app/settings", "/app/billing", "/app/searches"]) {
        jobs.push(view("APP-01", path, path));
      }
      jobs.push(view("APP-02", "/app/search", "/app/search"));
      if (!anon) {
        for (const q of queries) {
          jobs.push(
            ctx.run({
              id: "APP-02",
              instance: `q=${q}`,
              role,
              req: { path: "/app/search", query: [["q", q]] },
              status: [200],
              check: (o) => {
                const found = [...slugsIn(o.final.body)];
                return [
                  ok("results_subset_PUB", found.every((s) => pub.has(s)) && [...appDealIds(o.final.body)].every((d) => pubIds.has(d)), found),
                  o.control
                    ? eq("results_equal_control", resultKeys(o.control.result.final.body), resultKeys(o.final.body))
                    : ok("control_sent", false),
                ];
              },
            }),
          );
        }
      }
      jobs.push(
        view("APP-03", "/app/saved", "/app/saved", {
          check: (o) => {
            const listsB1 = slugsIn(o.final.body).has(ctx.row("B1").slug) || o.final.body.includes(titles.get("B1") ?? "\u0000");
            return [
              // Seed saves B1 for free only. Lapsed and expired have an empty list.
              ...(role === "free" ? [ok("lists_B1", listsB1, "B1 missing")] : []),
              ok("held_saved_rows_dropped", !o.final.body.includes(ctx.row("A1").deal_id) && !o.final.body.includes(ctx.row("E1").deal_id), "A1/E1 id present"),
            ];
          },
        }),
      );
      for (const rowId of PUB_ROWS) {
        jobs.push(view("APP-04", rowId, `/app/deals/${ctx.row(rowId).deal_id}`));
      }
      for (const rowId of [...heldRows(), "random"]) {
        const id = rowId === "random" ? "0badc0de-0000-4000-8000-000000000000" : ctx.row(rowId).deal_id;
        if (anon) jobs.push(view("APP-05", rowId, `/app/deals/${id}`));
        else
          jobs.push(
            ctx.run({
              id: "APP-05",
              instance: rowId,
              role,
              req: { path: `/app/deals/${id}` },
              status: (s) => s === 404 || s === 200,
              check: (o) => [
                ok(
                  "unpublished_not_served",
                  o.final.status === 404 || (o.final.status === 200 && /Page not found|Opportunity not found/i.test(o.final.body)),
                  o.final.status,
                ),
              ],
            }),
          );
      }
      for (const path of [
        "/app/buyers",
        `/app/buyers/${ctx.manifest.orgs.O1}`,
        "/app/suppliers",
        `/app/suppliers/${ctx.manifest.orgs.O2}`,
        "/app/contracts",
        "/app/renewals",
      ]) {
        jobs.push(view("APP-06", path, path));
      }
      // META-04: free roles' /app/deals metadata is NT and noindex.
      if (!anon) {
        for (const rowId of ["B1", "A1"]) {
          jobs.push(
            ctx.run({
              id: "META-04",
              instance: rowId,
              role,
              req: { path: `/app/deals/${ctx.row(rowId).deal_id}` },
              status: rowId === "B1" ? [200] : (s: number) => s === 404 || s === 200,
              check: (o) => [
                ok("noindex", isNoindex(pageMeta(o.final.body), o.final.headers), pageMeta(o.final.body).metas.filter((m) => m.key === "robots")),
                ...(rowId === "B1"
                  ? []
                  : [
                      ok(
                        "unpublished_not_served",
                        o.final.status === 404 || (o.final.status === 200 && /Page not found|Opportunity not found/i.test(o.final.body)),
                        o.final.status,
                      ),
                    ]),
              ],
            }),
          );
        }
      }
      await Promise.all(jobs);
    }),
  );
}

// ---------------------------------------------------------------------------
// Alerts (5.8, 01/02)
// ---------------------------------------------------------------------------

const ALERT_FORBIDDEN_KEYS = [
  "slug", "previewSummary", "protected_payload", "sourceTitle", "buyerName", "sourceUrl", "applicationUrl",
  "reference", "exactDeadline", "exactValue", "renewalDate",
];

export async function alertProbes(ctx: Ctx, roles: Role[] = FREE_ROLES): Promise<void> {
  const titles = previewTitles(ctx);
  const pubIds = new Map(PUB_ROWS.map((r) => [ctx.row(r).deal_id, r]));
  const heldIds = new Set(HELD_ROWS.map((r) => ctx.row(r).deal_id));
  await Promise.all(
    roles.map(async (role) => {
      await Promise.all([
        ctx.run({
          id: "ALERT-01",
          instance: "/app/alerts",
          role,
          req: { path: "/app/alerts" },
          status: [200],
          check: (o) => [ok("AL-1_shows_B1_preview_title", o.final.body.includes(titles.get("B1") ?? "\u0000"), "B1 preview title missing")],
        }),
        ctx.run({ id: "ALERT-01", instance: "/app/alerts@rsc", role, req: { path: "/app/alerts", rsc: "rsc" }, requireRsc: true }),
        ctx.run({
          id: "ALERT-02",
          instance: "/api/alerts",
          role,
          req: { path: "/api/alerts" },
          status: [200],
          check: (o) => {
            const items = ((o.json as { items?: Array<Record<string, unknown>> })?.items ?? []);
            const out: Assertion[] = [];
            const badKeys = items.flatMap((i) => Object.keys(i).filter((k) => !(FREE_ALERT_DTO_KEYS as readonly string[]).includes(k)));
            out.push(eq("keys_subset_FREE_ALERT_DTO_KEYS", [], sorted(badKeys)));
            const forbidden = items.flatMap((i) => Object.keys(i).filter((k) => ALERT_FORBIDDEN_KEYS.includes(k)));
            out.push(eq("no_forbidden_keys", [], sorted(forbidden)));
            const badHref = items.filter((i) => !/^\/app\/(deals\/[0-9a-f-]{36}|alerts)$/.test(String(i.href)));
            out.push(ok("href_shape", badHref.length === 0, badHref.map((i) => i.href)));
            const badTitle = items.filter((i) => {
              if (i.previewTitle === undefined) return false;
              const row = pubIds.get(String(i.dealId));
              return !row || i.previewTitle !== titles.get(row);
            });
            out.push(ok("previewTitle_only_for_published_deals", badTitle.length === 0, badTitle.map((i) => [i.dealId, i.previewTitle])));
            const al1 = items.find((i) => i.dealId === ctx.row("B1").deal_id);
            out.push(ok("AL-1_has_B1_preview_title", al1?.previewTitle === titles.get("B1"), al1));
            const heldItems = items.filter((i) => heldIds.has(String(i.dealId)));
            out.push(ok("held_deal_alerts_dropped", heldItems.length === 0, heldItems.map((i) => i.dealId)));
            return out;
          },
        }),
      ]);
    }),
  );
}

// ---------------------------------------------------------------------------
// Pro positive controls (5.12): these must FIND the tokens.
// ---------------------------------------------------------------------------

export function mustFind(o: ProbeOutcome, groups: string[][]): Assertion[] {
  const present = new Set(o.scan.tokens.keys());
  return groups.map((group) => ok(`finds:${group.join("|")}`, group.some((t) => present.has(t)), sorted(present)));
}

export async function proProbes(ctx: Ctx, idPrefix = "PRO"): Promise<void> {
  const role: Role = "pro";
  const b1 = ctx.row("B1").deal_id;
  const id = (n: string) => (idPrefix === "PRO" ? `PRO-${n}` : `${idPrefix}:PRO-${n}`);
  const family = idPrefix === "PRO" ? "PRO" : "FLOW";
  await Promise.all([
    ctx.run({ id: id("01"), family, instance: "B1", role, req: { path: `/app/deals/${b1}` }, status: [200], check: (o) => mustFind(o, [["T01"], ["T07", "T10"], ["T03"], ["T14"]]) }),
    ctx.run({ id: id("01"), family, instance: "B1@rsc", role, req: { path: `/app/deals/${b1}`, rsc: "rsc" }, requireRsc: true, check: (o) => mustFind(o, [["T01"], ["T07", "T10"], ["T03"], ["T14"]]) }),
    ctx.run({ id: id("02"), family, instance: "B1", role, req: { path: `/api/deals/${b1}` }, status: [200], check: (o) => mustFind(o, [["T01"], ["T07"], ["T03"]]) }),
    ctx.run({ id: id("03"), family, instance: "/api/alerts", role, req: { path: "/api/alerts" }, status: [200], check: (o) => mustFind(o, [["T01"], ["T10"]]) }),
    ctx.run({ id: id("04"), family, instance: "O1", role, req: { path: `/app/buyers/${ctx.manifest.orgs.O1}` }, status: [200], check: (o) => mustFind(o, [["T01"]]) }),
  ]);
}
