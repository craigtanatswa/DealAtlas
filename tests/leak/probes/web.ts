/** HTML, RSC, META and SEO probes (spec 5.2-5.5). */
import * as cheerio from "cheerio";

import type { Assertion, Ctx, ProbeDef, ProbeOutcome } from "../lib/probe";
import { UA_MATRIX, eq, ok, slugsIn, sorted } from "../lib/probe";
import type { Role } from "../lib/scan";
import {
  CATEGORY_LANDINGS,
  NON_PRO_ROLES,
  PUB_ROWS,
  STATIC_PAGES,
  heldRows,
  heldSlugs,
  isNoindex,
  metaAssertions,
  pageMeta,
  pubSlugs,
} from "./common";

type MetaOpts = { previewTitle?: string; mustNoindex?: boolean; jsonLdAllowed: boolean };

function heldIn(ctx: Ctx, text: string): string[] {
  const held = heldSlugs(ctx);
  return [...slugsIn(text)].filter((s) => held.has(s));
}

function cardSlugs(ctx: Ctx, text: string): Set<string> {
  const known = new Set([...pubSlugs(ctx), ...heldSlugs(ctx)]);
  return new Set([...slugsIn(text)].filter((s) => known.has(s)));
}

/**
 * An HTML probe plus its RSC-01/RSC-02 twins (every A-HTML URL) and, when
 * asked, META-01/02: derived from the Chromium response, and fetched again
 * for every other UA in the matrix.
 */
async function page(ctx: Ctx, def: ProbeDef, opts: { meta?: MetaOpts; uaMatrix?: boolean } = {}): Promise<ProbeOutcome> {
  const html = await ctx.run(def);
  const tasks: Array<Promise<unknown>> = [];
  for (const variant of ["rsc", "prefetch"] as const) {
    tasks.push(
      ctx.run({
        id: variant === "rsc" ? "RSC-01" : "RSC-02",
        instance: def.instance,
        role: def.role,
        req: { ...def.req, rsc: variant },
        requireRsc: true,
        hdr02: def.hdr02,
      }),
    );
  }
  if (opts.meta) {
    const meta = opts.meta;
    const split = (o: ProbeOutcome) => {
      const all = metaAssertions(o.final.body, o.final.status, meta, o.final.headers);
      const nt = o.parity ? [ok("no_forbidden_tokens", o.parity.pass, o.parity.unreflected.map((u) => u.tokenId))] : [];
      return { nt, og: all.filter((a) => !a.id.startsWith("json_ld")), ld: all.filter((a) => a.id.startsWith("json_ld")) };
    };
    const chromium = split(html);
    ctx.derive({ id: "META-01", instance: `${def.instance}@chromium`, role: def.role, assertions: [...chromium.nt, ...chromium.og], derivedFrom: html.url });
    ctx.derive({ id: "META-02", instance: `${def.instance}@chromium`, role: def.role, assertions: [...chromium.nt, ...chromium.ld], derivedFrom: html.url });
    if (opts.uaMatrix) {
      for (const ua of UA_MATRIX.filter((u) => u !== "chromium")) {
        tasks.push(
          ctx
            .run({
              id: "META-01",
              instance: `${def.instance}@${ua}`,
              role: def.role,
              req: { ...def.req, ua },
              status: def.status,
              check: (o) => split(o).og,
            })
            .then((o) => {
              const parts = split(o);
              ctx.derive({ id: "META-02", instance: `${def.instance}@${ua}`, role: def.role, assertions: [...parts.nt, ...parts.ld], derivedFrom: o.url });
            }),
        );
      }
    }
  }
  await Promise.all(tasks);
  return html;
}

const isRedirectToLogin = (o: ProbeOutcome) => {
  const first = o.result.hops[0];
  const location = first.headers.find(([n]) => n === "location")?.[1] ?? "";
  return first.status >= 300 && first.status < 400 && /\/login\?next=/.test(location);
};
export { isRedirectToLogin };

export async function htmlProbes(ctx: Ctx, roles: Role[] = NON_PRO_ROLES): Promise<void> {
  const pub = pubSlugs(ctx);
  const titles = previewTitles(ctx);
  const facets = facetValues(ctx);
  const queries = searchQueries(ctx);
  await Promise.all(
    roles.map(async (role) => {
      const jobs: Array<Promise<unknown>> = [];
      // HTML-01
      jobs.push(
        page(
          ctx,
          {
            id: "HTML-01",
            instance: "home",
            role,
            req: { path: "/" },
            status: [200],
            check: (o) => [ok("has_pub_slug", [...slugsIn(o.final.body)].some((s) => pub.has(s)), sorted(slugsIn(o.final.body))), ok("no_held_slug", heldIn(ctx, o.final.body).length === 0, heldIn(ctx, o.final.body))],
          },
          { meta: { jsonLdAllowed: true }, uaMatrix: true },
        ),
      );
      // HTML-02: /deals and ?page=2.. until a page has no cards.
      jobs.push(
        (async () => {
          const union = new Set<string>();
          const held = new Set<string>();
          for (let n = 1; n <= 10; n += 1) {
            const o = await page(
              ctx,
              { id: "HTML-02", instance: `page-${n}`, role, req: { path: "/deals", query: n === 1 ? [] : [["page", String(n)]] }, status: [200] },
              { meta: { jsonLdAllowed: true }, uaMatrix: n <= 2 },
            );
            const found = cardSlugs(ctx, o.final.body);
            heldIn(ctx, o.final.body).forEach((s) => held.add(s));
            if ([...found].filter((s) => pub.has(s)).length === 0) break;
            found.forEach((s) => pub.has(s) && union.add(s));
          }
          ctx.derive({
            id: "HTML-02",
            instance: "slug-union",
            role,
            assertions: [eq("slug_union_is_PUB", sorted(pub), sorted(union)), eq("no_held_slug", [], sorted(held))],
          });
        })(),
      );
      // HTML-03 x PUB
      for (const rowId of PUB_ROWS) {
        const row = ctx.row(rowId);
        jobs.push(
          page(
            ctx,
            {
              id: "HTML-03",
              instance: rowId,
              role,
              req: { path: `/deals/${row.slug}` },
              status: [200],
              check: (o) => {
                const out: Assertion[] = [];
                if (role === "anon") {
                  const l3 = o.scan.layers.L3;
                  out.push(ok("save_dealId_null", /"dealId":null/.test(l3) && !/"dealId":"[0-9a-f-]{36}"/.test(l3), l3.match(/"dealId":[^,}]*/g)?.slice(0, 3)));
                }
                return out;
              },
            },
            { meta: { previewTitle: titles.get(rowId), jsonLdAllowed: true }, uaMatrix: true },
          ),
        );
      }
      // HTML-04 x HELD
      for (const rowId of heldRows()) {
        jobs.push(
          page(
            ctx,
            {
              id: "HTML-04",
              instance: rowId,
              role,
              req: { path: `/deals/${ctx.row(rowId).slug}` },
              status: (s) => s === 404 || s === 200,
              hdr02: true,
              check: (o) => [
                ok(
                  "unpublished_not_served",
                  o.final.status === 404 || (o.final.status === 200 && /<title>[^<]*Opportunity not found/i.test(o.final.body)),
                  o.final.status,
                ),
              ],
            },
            { meta: { jsonLdAllowed: false } },
          ),
        );
      }
      // HTML-05 static pages
      for (const p of STATIC_PAGES) {
        jobs.push(page(ctx, { id: "HTML-05", instance: p, role, req: { path: p }, status: [200] }, { meta: { jsonLdAllowed: true }, uaMatrix: true }));
      }
      // HTML-06 categories
      for (const landing of CATEGORY_LANDINGS) {
        const expected = PUB_ROWS.filter((r) => facets.categoryOf.get(r) === landing.name).map((r) => ctx.row(r).slug);
        jobs.push(
          page(
            ctx,
            {
              id: "HTML-06",
              instance: landing.slug,
              role,
              req: { path: landing.path },
              status: [200],
              check: (o) => {
                const found = cardSlugs(ctx, o.final.body);
                return [
                  ok("lists_pub_rows_of_category", expected.every((s) => found.has(s)), { expected, found: sorted(found) }),
                  ok("no_held_slug", heldIn(ctx, o.final.body).length === 0, heldIn(ctx, o.final.body)),
                ];
              },
            },
            { meta: { jsonLdAllowed: true }, uaMatrix: true },
          ),
        );
      }
      // HTML-07 /deals?q=<search query>
      for (const q of queries) {
        jobs.push(
          page(
            ctx,
            {
              id: "HTML-07",
              instance: `q=${q}`,
              role,
              req: { path: "/deals", query: [["q", q]] },
              status: [200],
              hdr02: true,
              check: (o) => [
                ok("no_held_slug", heldIn(ctx, o.final.body).length === 0, heldIn(ctx, o.final.body)),
                o.control
                  ? eq("cards_equal_control", sorted(cardSlugs(ctx, o.control.result.final.body)), sorted(cardSlugs(ctx, o.final.body)))
                  : ok("control_sent", false, "no control"),
                ok("noindex", isNoindex(pageMeta(o.final.body), o.final.headers), "META-05"),
              ],
            },
            {},
          ),
        );
      }
      // HTML-08 facets
      for (const [param, value] of facets.params) {
        jobs.push(
          page(ctx, {
            id: "HTML-08",
            instance: `${param}=${value}`,
            role,
            req: { path: "/deals", query: [[param, value]] },
            status: [200],
            check: (o) => {
              const found = cardSlugs(ctx, o.final.body);
              return [
                ok("no_held_slug", heldIn(ctx, o.final.body).length === 0, heldIn(ctx, o.final.body)),
                ok("cards_subset_PUB", [...found].every((s) => pub.has(s)), sorted(found)),
                ok("noindex", isNoindex(pageMeta(o.final.body), o.final.headers), "META-05"),
              ];
            },
          }),
        );
      }
      // HTML-09
      for (const [instance, path, raw] of [
        ["random-valid-slug", "/deals/grounds-maintenance-services-0badc0de", false],
        ["invalid-slug", "/deals/INVALID_SLUG!", true],
        ["does-not-exist", "/does-not-exist", false],
      ] as Array<[string, string, boolean]>) {
        jobs.push(page(ctx, { id: "HTML-09", instance, role, req: { path, rawPath: raw }, status: [404] }, { meta: { jsonLdAllowed: false } }));
      }
      // HTML-10
      jobs.push(page(ctx, { id: "HTML-10", instance: "design-system", role, req: { path: "/design-system" }, status: [200] }));
      await Promise.all(jobs);
    }),
  );
}

export function previewTitles(ctx: Ctx): Map<string, string> {
  const rows = ctx.psqlJson<Array<{ deal_id: string; preview_title: string }>>(
    "select deal_id, preview_title from public.deal_previews where deal_id::text like '5eed0000-%'",
  );
  const byId = new Map(rows.map((r) => [r.deal_id, r.preview_title]));
  return new Map(Object.entries(ctx.manifest.rows).map(([id, row]) => [id, byId.get(row.deal_id) ?? ""]));
}

export function searchQueries(ctx: Ctx): string[] {
  return [...new Set(ctx.manifest.tokens.flatMap((t) => t.search_queries))];
}

export function facetValues(ctx: Ctx): { params: Array<[string, string]>; categoryOf: Map<string, string> } {
  const rows = ctx.psqlJson<Array<Record<string, string>>>(
    `select d.id::text as deal_id, dp.main_category, dp.broad_region, dp.value_band, dp.deadline_band, dp.deal_type::text, dp.status::text
     from public.deal_previews dp join public.deals d on d.id = dp.deal_id
     where dp.is_published and dp.leakage_risk = 'LOW' and dp.deal_id::text like '5eed0000-%'`,
  );
  const params = new Map<string, Set<string>>();
  const add = (k: string, v: string | null) => {
    if (!v) return;
    if (!params.has(k)) params.set(k, new Set());
    params.get(k)!.add(v);
  };
  for (const r of rows) {
    add("category", r.main_category);
    add("region", r.broad_region);
    add("valueBand", r.value_band);
    add("deadlineBand", r.deadline_band);
    add("dealType", r.deal_type);
    add("status", r.status);
  }
  const out: Array<[string, string]> = [...params].flatMap(([k, vs]) => [...vs].sort().map((v) => [k, v] as [string, string]));
  out.push(["region", "Zarqwellshire"], ["category", "Quellmoor"]);
  const byDeal = new Map(rows.map((r) => [r.deal_id, r.main_category]));
  const categoryOf = new Map(Object.entries(ctx.manifest.rows).map(([id, row]) => [id, byDeal.get(row.deal_id) ?? ""]));
  return { params: out, categoryOf };
}

// ---------------------------------------------------------------------------
// META-03/05 extras and SEO
// ---------------------------------------------------------------------------

export async function metaExtraProbes(ctx: Ctx, roles: Role[] = NON_PRO_ROLES): Promise<void> {
  const b1 = ctx.row("B1").slug;
  const jobs: Array<Promise<unknown>> = [];
  for (const role of roles) {
    for (const path of [`/deals/${b1}/opengraph-image`, `/deals/${b1}/twitter-image`, "/opengraph-image", "/twitter-image"]) {
      jobs.push(ctx.run({ id: "META-03", instance: path, role, req: { path }, status: [404] }));
    }
  }
  await Promise.all(jobs);
}

/** RSC-04 (informational, OQ-11): a hand-built `_rsc` value; a 200 body must still pass NT. */
export async function rscHandBuiltProbes(ctx: Ctx, roles: Role[] = NON_PRO_ROLES): Promise<void> {
  const paths = ["/deals", `/deals/${ctx.row("B1").slug}`, `/deals/${ctx.row("A1").slug}`];
  await Promise.all(
    roles.flatMap((role) =>
      paths.map((path) =>
        ctx.run({
          id: "RSC-04",
          instance: path,
          role,
          req: { path, query: [["_rsc", "leakprobe"]], rsc: "rsc" },
          check: (o) => [{ id: "status_recorded", pass: true, blocking: false, actual: o.final.status }],
        }),
      ),
    ),
  );
}

function locs(xml: string): string[] {
  const $ = cheerio.load(xml, { xml: true });
  return $("loc")
    .map((_, el) => $(el).text().trim())
    .get();
}

function lastmods(xml: string): string[] {
  const $ = cheerio.load(xml, { xml: true });
  return $("lastmod")
    .map((_, el) => $(el).text().trim())
    .get();
}

export async function seoProbes(ctx: Ctx): Promise<void> {
  const pub = pubSlugs(ctx);
  const held = heldSlugs(ctx);
  // Indexable PUB set, taken from the PUB detail pages themselves (HTML-03, anon, chromium).
  const indexable = new Set(
    PUB_ROWS.filter((r) => {
      const o = ctx.outcome("HTML-03", "anon", r);
      return o && o.final.status === 200 && !isNoindex(pageMeta(o.final.body), o.final.headers);
    }).map((r) => ctx.row(r).slug),
  );
  for (const ua of ["chromium", "googlebot"] as const) {
    const role: Role = "anon";
    const tag = `@${ua}`;
    await ctx.run({
      id: "SEO-01",
      instance: `robots${tag}`,
      role,
      req: { path: "/robots.txt", ua },
      status: [200],
      check: (o) => [
        ok("lists_sitemap_xml", /sitemap:\s*\S+\/sitemap\.xml\b/i.test(o.final.body), o.final.body.slice(0, 400)),
        ok("lists_deals_sitemap_xml", /sitemap:\s*\S+\/deals\/sitemap\.xml\b/i.test(o.final.body), o.final.body.slice(0, 400)),
      ],
    });
    await ctx.run({
      id: "SEO-02",
      instance: `sitemap${tag}`,
      role,
      req: { path: "/sitemap.xml", ua },
      status: [200],
      check: (o) => {
        const paths = locs(o.final.body).map((l) => new URL(l).pathname);
        const categories = paths.filter((p) => p.startsWith("/categories/"));
        const deals = paths.filter((p) => p.startsWith("/deals/"));
        return [
          eq("category_paths", sorted(CATEGORY_LANDINGS.map((c) => c.path)), sorted(categories)),
          eq("no_deal_paths", [], deals),
        ];
      },
    });
    const pages = Math.max(1, Math.ceil(pub.size / 1000));
    const union = new Set<string>();
    const allLocs: string[] = [];
    for (let id = 0; id <= pages; id += 1) {
      const last = id === pages;
      const o = await ctx.run({
        id: "SEO-03",
        instance: `deals-sitemap-${id}${tag}`,
        role,
        req: { path: `/deals/sitemap/${id}.xml`, ua },
        status: last ? [200, 404] : [200],
        check: (o) => {
          const found = locs(o.final.body);
          const mods = lastmods(o.final.body);
          const out: Assertion[] = [
            ok("lastmod_monday", mods.every((m) => new Date(`${m.slice(0, 10)}T00:00:00Z`).getUTCDay() === 1), mods.slice(0, 5)),
          ];
          if (last) out.push(eq("past_last_page_empty", [], found));
          return out;
        },
      });
      for (const loc of locs(o.final.body)) {
        allLocs.push(loc);
        const slug = new URL(loc).pathname.replace(/^\/deals\//, "");
        union.add(slug);
      }
    }
    ctx.derive({
      id: "SEO-03",
      instance: `slug-union${tag}`,
      role,
      assertions: [
        ok("indexable_set_nonempty", indexable.size > 0, indexable.size),
        eq("slug_union_is_indexable_PUB", sorted(indexable), sorted(union)),
        ok("no_held_slug", [...union].every((s) => !held.has(s)), sorted([...union].filter((s) => held.has(s)))),
      ],
    });
    await ctx.run({
      id: "SEO-04",
      instance: `deals-sitemap-xml${tag}`,
      role,
      severity: "P2",
      req: { path: "/deals/sitemap.xml", ua },
      check: (o) => {
        const isXml = /xml/.test(o.final.contentType);
        const softHtml = o.final.status === 200 && /text\/html/.test(o.final.contentType);
        return [ok("xml_or_404", (o.final.status === 200 && isXml) || o.final.status === 404, { status: o.final.status, type: o.final.contentType, soft404: softHtml }, { code: softHtml ? "SOFT_404" : undefined })];
      },
    });
    if (ua === "chromium") {
      await Promise.all(
        [...new Set(allLocs)].map((loc) =>
          ctx.run({ id: "SEO-05", instance: new URL(loc).pathname, role, req: { path: new URL(loc).pathname }, status: [200] }),
        ),
      );
    }
  }
}
