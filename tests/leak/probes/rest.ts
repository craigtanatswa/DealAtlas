/** Direct PostgREST and GraphQL probes (spec 5.11) and the Phase B lockdown (B-LOCK-01..05). */
import type { Assertion, Ctx, ProbeOutcome, RequestSpec } from "../lib/probe";
import { eq, ok, sorted } from "../lib/probe";
import type { Role } from "../lib/scan";
import {
  DTO_SNAKE_KEYS,
  FREE_ROLES,
  NON_PRO_ROLES,
  PUB_ROWS,
  SAVED_KEYS,
  SITEMAP_KEYS,
  dtoAssertions,
  enumSets,
  heldRows,
  heldSlugs,
  pubSlugs,
  type EnumSets,
} from "./common";
import { searchQueries } from "./web";

const SEARCH_KEYS = [...DTO_SNAKE_KEYS, "total_count"];

function rows(o: ProbeOutcome): Array<Record<string, unknown>> {
  return Array.isArray(o.json) ? (o.json as Array<Record<string, unknown>>) : [];
}

function slugSet(o: ProbeOutcome): string[] {
  return sorted(rows(o).map((r) => String(r.slug)));
}

const denied = (s: number) => s === 401 || s === 403 || s === 404;
const deniedNoData = (o: ProbeOutcome): Assertion => {
  const empty = !Array.isArray(o.json) || (o.json as unknown[]).length === 0;
  return ok("no_data", denied(o.final.status) || (o.final.status < 300 && empty), { status: o.final.status, body: o.final.body.slice(0, 200) });
};

function rpc(name: string, json: unknown = {}, extra: Partial<RequestSpec> = {}): RequestSpec {
  return { target: "rest", method: "POST", path: `/rpc/${name}`, json, ...extra };
}

/** Rows normalised for cross-phase comparison: stable order, no volatile fields. */
function normalise(o: ProbeOutcome): unknown {
  if (!Array.isArray(o.json)) return o.json;
  return (o.json as Array<Record<string, unknown>>)
    .map((r) => JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)))))
    .sort();
}

export async function restProbes(ctx: Ctx): Promise<void> {
  const enums = enumSets(ctx);
  const pub = pubSlugs(ctx);
  const held = heldSlugs(ctx);
  const queries = searchQueries(ctx);
  const jobs: Array<Promise<unknown>> = [];
  const snap = (key: string) => (o: ProbeOutcome) => {
    ctx.snapshots.set(key, { status: o.final.status, body: normalise(o) });
    return o;
  };

  for (const role of NON_PRO_ROLES) {
    const restAuth = role === "anon" ? "anon" : "role";
    // REST-01
    jobs.push(
      ctx
        .run({
          id: "REST-01",
          instance: "{}",
          role,
          req: rpc("search_preview_dtos", {}, { restAuth }),
          status: [200],
          check: (o) => [
            ...dtoAssertions(o.json, SEARCH_KEYS, enums, { role, label: "search" }),
            eq("total_count", 12, rows(o)[0]?.total_count),
            ok("at_most_50_rows", rows(o).length <= 50, rows(o).length),
          ],
        })
        .then(snap(`REST-01|${role}|{}`)),
      (async () => {
        const union = new Set<string>();
        for (let k = 0; k < 500; k += 50) {
          const o = await ctx.run({
            id: "REST-01",
            instance: `p_limit=50&p_offset=${k}`,
            role,
            req: rpc("search_preview_dtos", { p_limit: 50, p_offset: k }, { restAuth }),
            status: [200],
            check: (o) => [...dtoAssertions(o.json, SEARCH_KEYS, enums, { role, label: "search" }), ok("at_most_50_rows", rows(o).length <= 50, rows(o).length)],
          });
          slugSet(o).forEach((s) => union.add(s));
          if (rows(o).length < 50) break;
        }
        ctx.derive({ id: "REST-01", instance: "slug-union", role, assertions: [eq("slug_union_is_PUB", sorted(pub), sorted(union))] });
        ctx.snapshots.set(`REST-01|${role}|union`, sorted(union));
      })(),
    );
    for (const [instance, args, statuses] of [
      ["p_limit=100000", { p_limit: 100000 }, [200]],
      ["p_offset=-5", { p_offset: -5 }, [200, 400]],
      ["p_offset=20000", { p_offset: 20000 }, [200]],
    ] as Array<[string, Record<string, number>, number[]]>) {
      jobs.push(
        ctx.run({
          id: "REST-01",
          instance,
          role,
          req: rpc("search_preview_dtos", args, { restAuth }),
          status: statuses,
          check: (o) => [
            ...(o.final.status === 200 ? dtoAssertions(o.json, SEARCH_KEYS, enums, { role, label: "search" }) : []),
            ok("at_most_50_rows", rows(o).length <= 50, rows(o).length),
            ok("only_PUB", slugSet(o).every((s) => pub.has(s)), slugSet(o)),
          ],
        }),
      );
    }
    for (const q of queries) {
      jobs.push(
        ctx.run({
          id: "REST-01",
          instance: `p_query=${q}`,
          role,
          req: rpc("search_preview_dtos", { p_query: q }, { restAuth }),
          status: [200],
          check: (o) => [
            ...dtoAssertions(o.json, SEARCH_KEYS, enums, { role, label: "search" }),
            o.control ? eq("equals_control", slugSet({ ...o, json: o.control.json } as ProbeOutcome), slugSet(o)) : ok("control_sent", false),
          ],
        }),
      );
    }
    // REST-02
    for (const rowId of PUB_ROWS) {
      jobs.push(
        ctx
          .run({
            id: "REST-02",
            instance: rowId,
            role,
            req: rpc("get_preview_dto_by_slug", { p_slug: ctx.row(rowId).slug }, { restAuth }),
            status: [200],
            check: (o) => [...dtoAssertions(o.json, DTO_SNAKE_KEYS, enums, { role, label: "by_slug" }), eq("one_row", 1, rows(o).length)],
          })
          .then(snap(`REST-02|${role}|${rowId}`)),
      );
    }
    for (const rowId of heldRows()) {
      jobs.push(
        ctx.run({
          id: "REST-02",
          instance: rowId,
          role,
          req: rpc("get_preview_dto_by_slug", { p_slug: ctx.row(rowId).slug }, { restAuth }),
          status: [200],
          check: (o) => [eq("empty", 0, rows(o).length)],
        }),
      );
    }
    for (const [instance, slug] of [["%", "%"], ["grounds%", "grounds%"], ["201-chars", "a".repeat(201)], ["empty", ""]]) {
      jobs.push(
        ctx.run({
          id: "REST-02",
          instance,
          role,
          req: rpc("get_preview_dto_by_slug", { p_slug: slug }, { restAuth }),
          status: [200, 400],
          check: (o) => [eq("empty", 0, rows(o).length)],
        }),
      );
    }
    // REST-03 / REST-04
    for (const [instance, args] of [["{}", {}], ["p_limit=1000", { p_limit: 1000 }], ["p_offset=1000", { p_offset: 1000 }]] as Array<[string, Record<string, number>]>) {
      jobs.push(
        ctx
          .run({
            id: "REST-03",
            instance,
            role,
            req: rpc("list_preview_sitemap_entries", args, { restAuth }),
            status: [200],
            check: (o) => [
              ...dtoAssertions(o.json, SITEMAP_KEYS, enums, { role, label: "sitemap", sitemap: true }),
              instance === "p_offset=1000" ? eq("empty", [], slugSet(o)) : eq("slugs_are_PUB", sorted(pub), slugSet(o)),
            ],
          })
          .then(snap(`REST-03|${role}|${instance}`)),
      );
    }
    jobs.push(
      ctx
        .run({
          id: "REST-04",
          instance: "count",
          role,
          req: rpc("count_preview_sitemap_entries", {}, { restAuth }),
          status: [200],
          check: (o) => [eq("bare_number_12", 12, o.json)],
        })
        .then(snap(`REST-04|${role}|count`)),
    );
    // REST-05: the same RPCs via GET.
    jobs.push(
      (async () => {
        const pairs: Array<[string, Array<[string, string]>, unknown]> = [
          ["search_preview_dtos", [["p_limit", "50"]], { p_limit: 50 }],
          ["get_preview_dto_by_slug", [["p_slug", ctx.row("B1").slug]], { p_slug: ctx.row("B1").slug }],
          ["list_preview_sitemap_entries", [], {}],
          ["count_preview_sitemap_entries", [], {}],
        ];
        for (const [name, query, body] of pairs) {
          const post = await ctx.fetch(rpc(name, body, { restAuth }), role);
          await ctx.run({
            id: "REST-05",
            instance: name,
            role,
            req: { target: "rest", path: `/rpc/${name}`, query, restAuth },
            status: [200],
            check: (o) => [eq("same_as_post", post.result.final.body.length > 0 ? JSON.parse(post.result.final.body) : null, o.json)],
          });
        }
      })(),
    );
    // REST-06: column smuggling.
    for (const select of ["deal_id", "*,deal_previews(*)", "slug,leakage_risk"]) {
      jobs.push(
        ctx.run({
          id: "REST-06",
          instance: `select=${select}`,
          role,
          req: { ...rpc("search_preview_dtos", {}, { restAuth }), query: [["select", select]] },
          check: (o) => [
            ok(
              "4xx_or_allowlisted",
              (o.final.status >= 400 && o.final.status < 500) || rows(o).every((r) => Object.keys(r).every((k) => SEARCH_KEYS.includes(k))),
              { status: o.final.status, keys: rows(o)[0] && Object.keys(rows(o)[0]) },
            ),
          ],
        }),
      );
    }
    jobs.push(
      ctx.run({
        id: "REST-06",
        instance: "order=updated_at",
        role,
        req: { ...rpc("search_preview_dtos", {}, { restAuth }), query: [["order", "updated_at"]] },
        check: (o) => [ok("4xx_or_allowlisted", (o.final.status >= 400 && o.final.status < 500) || rows(o).every((r) => Object.keys(r).every((k) => SEARCH_KEYS.includes(k))), o.final.status)],
      }),
    );
    // REST-08 legacy RPCs.
    const freeProfile = role === "anon" ? null : companyProfileId(ctx, role);
    for (const [name, args] of [
      ["search_deal_previews", {}],
      ["search_deal_previews_for_profile", { p_company_profile_id: freeProfile ?? "00000000-0000-4000-8000-000000000000" }],
    ] as Array<[string, Record<string, unknown>]>) {
      jobs.push(
        ctx.run({
          id: "REST-08",
          instance: name,
          role,
          req: rpc(name, args, { restAuth }),
          status: ctx.phase === "A" ? [200] : (s) => s === 401 || s === 403 || s === 404,
          expectedExposure:
            ctx.phase === "A" ? { tokens: ["T31"], reason: "OQ-9: pre-0019 legacy RPCs return deal_id (F1 class, closed by 0019)" } : undefined,
          check: (o) =>
            ctx.phase === "A"
              ? [ok("returns_deal_id", rows(o).length === 0 || "deal_id" in rows(o)[0], rows(o)[0] && Object.keys(rows(o)[0])), ok("rows_subset_PUB", slugSet(o).every((s) => pub.has(s)), slugSet(o))]
              : [deniedNoData(o)],
        }),
      );
    }
  }

  // REST-07: anon denied.
  for (const [name, args] of [
    ["resolve_preview_deal_id", { p_slug: ctx.row("B1").slug }],
    ["get_preview_dto_by_deal_id", { p_deal_id: ctx.row("B1").deal_id }],
    ["list_saved_deal_previews", {}],
    ["admin_release_preview_hold", { p_deal_id: ctx.row("A1").deal_id }],
    ["admin_merge_organizations", { p_keep: ctx.manifest.orgs.O1, p_drop: ctx.manifest.orgs.O2 }],
  ] as Array<[string, Record<string, unknown>]>) {
    jobs.push(
      ctx.run({
        id: "REST-07",
        instance: name,
        role: "anon",
        req: rpc(name, args, { restAuth: "anon" }),
        status: denied,
        check: (o) => [deniedNoData(o), ok("A1_still_held", a1Held(ctx), "A1 hold missing")],
      }),
    );
  }

  // REST-09 (Phase A) / B-LOCK-01..04 (Phase B).
  if (ctx.phase === "A") {
    for (const [instance, query] of [
      ["select=*", [["select", "*"]]],
      ["select=*&limit=1000", [["select", "*"], ["limit", "1000"]]],
    ] as Array<[string, Array<[string, string]>]>) {
      jobs.push(
        ctx.run({
          id: "REST-09",
          instance,
          role: "anon",
          req: { target: "rest", path: "/deal_previews", query, restAuth: "anon" },
          status: [200],
          expectedExposure: { tokens: ["T31"], reason: "OQ-9: pre-0019 anon reads deal_previews internals (closed by 0019)" },
          check: (o) => [eq("rows_are_PUB", sorted(pub), slugSet(o)), ok("no_held_row", slugSet(o).every((s) => !held.has(s)), slugSet(o))],
        }),
      );
    }
    jobs.push(
      ctx.run({
        id: "REST-09",
        instance: "HEAD count=exact",
        role: "anon",
        req: { target: "rest", method: "HEAD", path: "/deal_previews", headers: { prefer: "count=exact" }, restAuth: "anon" },
        status: [200, 206],
        check: (o) => {
          const range = o.final.headers.find(([n]) => n === "content-range")?.[1] ?? "";
          return [eq("content_range_total_12", "12", range.split("/")[1])];
        },
      }),
    );
  } else {
    await lockProbes(ctx, jobs);
  }

  // REST-10: every public table as anon.
  const tables = ctx.psql("select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname = 'public'").split(",");
  for (const table of tables) {
    if (table === "deal_previews") continue;
    jobs.push(
      ctx.run({
        id: "REST-10",
        instance: table,
        role: "anon",
        req: { target: "rest", path: `/${table}`, query: [["select", "*"], ["limit", "1"]], restAuth: "anon" },
        check: (o) => [deniedNoData(o)],
      }),
    );
  }

  // REST-11: free JWT.
  for (const role of FREE_ROLES) {
    const own = ["profiles", "company_profiles", "saved_deals", "saved_searches", "notification_preferences"];
    const userId = ctx.session(role).userId;
    for (const table of own) {
      jobs.push(
        ctx.run({
          id: "REST-11",
          instance: table,
          role,
          req: { target: "rest", path: `/${table}`, query: [["select", "*"]] },
          status: [200],
          check: (o) => {
            const foreign = rows(o).filter((r) => (r.user_id ?? r.id) !== userId);
            return [ok("own_rows_only", foreign.length === 0, foreign.length)];
          },
        }),
      );
    }
    jobs.push(
      ctx.run({
        id: "REST-11",
        instance: "deal_matches?select=id,deal_id,relevance_score,preview_reasons",
        role,
        req: { target: "rest", path: "/deal_matches", query: [["select", "id,deal_id,relevance_score,preview_reasons"]] },
        check: (o) => [deniedNoData(o)],
      }),
      ctx.run({
        id: "REST-11",
        instance: "deal_matches?select=detail_reasons",
        role,
        req: { target: "rest", path: "/deal_matches", query: [["select", "detail_reasons"]] },
        check: (o) => [deniedNoData(o)],
      }),
      ctx.run({
        id: "REST-11",
        instance: "deal_matches?select=id,deal_id,relevance_score",
        role,
        req: { target: "rest", path: "/deal_matches", query: [["select", "id,deal_id,relevance_score"]] },
        status: [200],
      }),
    );
    for (const table of [
      "deals", "organizations", "organization_aliases", "organization_contacts", "notices", "raw_records", "documents",
      "awards", "award_suppliers", "contracts", "private_opportunity_details", "deal_insights", "alerts", "subscriptions",
      "billing_events",
    ]) {
      jobs.push(
        ctx.run({
          id: "REST-11",
          instance: table,
          role,
          req: { target: "rest", path: `/${table}`, query: [["select", "*"], ["limit", "5"]] },
          check: (o) => [deniedNoData(o)],
        }),
      );
    }
  }

  // REST-12: other schemas.
  for (const [instance, req] of [
    ["private/preview_holds", { target: "rest", path: "/preview_holds", headers: { "accept-profile": "private" }, restAuth: "anon" }],
    ["private/leak_gate_terms", { target: "rest", path: "/leak_gate_terms", headers: { "accept-profile": "private" }, restAuth: "anon" }],
    ["extensions/leak_gate_terms", { target: "rest", path: "/leak_gate_terms", headers: { "accept-profile": "extensions" }, restAuth: "anon" }],
    ["auth/users", { target: "rest", path: "/users", headers: { "accept-profile": "auth" }, restAuth: "anon" }],
    ["private/rpc/detect_preview_leakage", { ...rpc("detect_preview_leakage", { p_deal_id: ctx.row("B1").deal_id }), headers: { "content-profile": "private" }, restAuth: "anon" }],
  ] as Array<[string, RequestSpec]>) {
    jobs.push(
      ctx.run({
        id: "REST-12",
        instance,
        role: "anon",
        req,
        status: (s) => s >= 400 && s < 500,
        check: (o) => [deniedNoData(o)],
      }),
    );
  }

  // REST-13: hints must not name private objects (P2, OQ-8).
  const privateNames = privateObjectNames(ctx);
  for (const [instance, req] of [
    ...["/deal", "/deal_preview", "/organisation", "/alert", "/preview_hold", "/subscription"].map(
      (p) => [p, { target: "rest", path: p, restAuth: "anon" }] as [string, RequestSpec],
    ),
    ...["resolve_preview_deal", "detect_preview_leakage", "preview_leak_findings"].map(
      (n) => [`rpc/${n}`, { ...rpc(n, {}), restAuth: "anon" }] as [string, RequestSpec],
    ),
  ]) {
    jobs.push(
      ctx.run({
        id: "REST-13",
        instance,
        role: "anon",
        severity: "P2",
        req,
        check: (o) => {
          const json = (o.json ?? {}) as Record<string, unknown>;
          const text = [json.message, json.hint, json.details].filter(Boolean).join(" | ");
          const requested = instance.replace(/^\/|^rpc\//, "");
          const named = privateNames.filter((n) => n !== requested && new RegExp(`(?<![a-z0-9_])${n}(?![a-z0-9_])`).test(text));
          return [ok("hint_names_no_private_object", named.length === 0, { named, text }, { code: named.length ? "REST_HINT" : undefined })];
        },
      }),
    );
  }

  // REST-14: GraphQL.
  jobs.push(
    ctx.run({
      id: "REST-14",
      instance: "introspection",
      role: "anon",
      req: { target: "graphql", method: "POST", path: "", json: { query: "{ __schema { queryType { fields { name } } } }" }, restAuth: "anon" },
      check: (o) => [ok("unavailable_or_no_preview_collection", o.final.status >= 400 || !/dealPreviewsCollection/.test(o.final.body), o.final.body.slice(0, 300))],
    }),
    ctx.run({
      id: "REST-14",
      instance: "dealPreviewsCollection",
      role: "anon",
      req: { target: "graphql", method: "POST", path: "", json: { query: "{ dealPreviewsCollection { edges { node { dealId slug } } } }" }, restAuth: "anon" },
      check: (o) => [ok("unavailable_or_no_rows", o.final.status >= 400 || !/"dealId"\s*:\s*"/.test(o.final.body), o.final.body.slice(0, 300))],
    }),
  );

  // REST-15: writes as anon and free.
  const before = writeFingerprint(ctx);
  for (const role of ["anon", "free"] as Role[]) {
    const restAuth = role === "anon" ? "anon" : "role";
    for (const table of ["deal_previews", "deals", "alerts"]) {
      for (const method of ["POST", "PATCH", "DELETE"]) {
        jobs.push(
          ctx.run({
            id: "REST-15",
            instance: `${method} /${table}`,
            role,
            req: {
              target: "rest",
              method,
              path: `/${table}`,
              query: method === "POST" ? [] : [["id", "not.is.null"]],
              json: method === "DELETE" ? undefined : { title: "leakprobe-write" },
              headers: { prefer: "return=representation" },
              restAuth,
            },
            check: (o) => [ok("denied", o.final.status >= 400 || rows(o).length === 0, { status: o.final.status, body: o.final.body.slice(0, 200) })],
          }),
        );
      }
    }
    jobs.push(
      ctx.run({
        id: "REST-15",
        instance: "PATCH deal_previews A1 unpublished_by_admin=false",
        role,
        req: {
          target: "rest",
          method: "PATCH",
          path: "/deal_previews",
          query: [["deal_id", `eq.${ctx.row("A1").deal_id}`]],
          json: { unpublished_by_admin: false },
          headers: { prefer: "return=representation" },
          restAuth,
        },
        check: (o) => [ok("denied", o.final.status >= 400 || rows(o).length === 0, o.final.status)],
      }),
    );
  }

  // REST-16: free JWT on the signed-in RPCs.
  for (const role of FREE_ROLES) {
    for (const rowId of [...PUB_ROWS, ...heldRows()]) {
      const isPub = PUB_ROWS.includes(rowId);
      jobs.push(
        ctx
          .run({
            id: "REST-16",
            instance: `resolve:${rowId}`,
            role,
            req: rpc("resolve_preview_deal_id", { p_slug: ctx.row(rowId).slug }),
            status: [200],
            check: (o) => [eq("resolves", isPub ? ctx.row(rowId).deal_id : null, o.json)],
          })
          .then(snap(`REST-16|${role}|resolve:${rowId}`)),
        ctx
          .run({
            id: "REST-16",
            instance: `by_deal_id:${rowId}`,
            role,
            req: rpc("get_preview_dto_by_deal_id", { p_deal_id: ctx.row(rowId).deal_id }),
            status: [200],
            check: (o) =>
              isPub
                ? [...dtoAssertions(o.json, DTO_SNAKE_KEYS, enums, { role, label: "by_deal_id" }), eq("one_row", 1, rows(o).length)]
                : [eq("empty", 0, rows(o).length)],
          })
          .then(snap(`REST-16|${role}|by_deal_id:${rowId}`)),
      );
    }
    jobs.push(
      ctx
        .run({
          id: "REST-16",
          instance: "list_saved_deal_previews",
          role,
          req: rpc("list_saved_deal_previews", {}),
          status: [200],
          check: (o) => {
            const list = rows(o);
            const bad = list.filter((r) => JSON.stringify(Object.keys(r).sort()) !== JSON.stringify([...SAVED_KEYS].sort()));
            const heldIds = new Set(heldRows().map((r) => ctx.row(r).deal_id));
            return [
              ok("exact_keys_22", bad.length === 0 && SAVED_KEYS.length === 22, bad.slice(0, 2).map((r) => Object.keys(r))),
              ok("no_held_rows", list.every((r) => !heldIds.has(String(r.deal_id))), list.map((r) => r.deal_id)),
              ok("rows_are_published", list.every((r) => r.slug === null || pub.has(String(r.slug))), list.map((r) => r.slug)),
            ];
          },
        })
        .then(snap(`REST-16|${role}|list_saved`)),
    );
  }

  await Promise.all(jobs);
  const after = writeFingerprint(ctx);
  ctx.derive({ id: "REST-15", instance: "psql-unchanged", role: "db", assertions: [eq("nothing_changed", before, after), ok("A1_still_held", a1Held(ctx))] });
}

async function lockProbes(ctx: Ctx, jobs: Array<Promise<unknown>>): Promise<void> {
  const variants: Array<[string, Array<[string, string]>]> = [
    ["no params", []],
    ["select=*", [["select", "*"]]],
    ["select=slug", [["select", "slug"]]],
    ["select=deal_id,slug,preview_title", [["select", "deal_id,slug,preview_title"]]],
    ["limit=1000", [["limit", "1000"]]],
    ["is_published=eq.true", [["is_published", "eq.true"]]],
  ];
  const lockedOut = (o: ProbeOutcome): Assertion[] => {
    const range = o.final.headers.find(([n]) => n === "content-range")?.[1] ?? "";
    return [
      ok("denied_401_403", o.final.status === 401 || o.final.status === 403, o.final.status),
      ok("no_rows", rows(o).length === 0, rows(o).length),
      ok("no_count_disclosed", !/\/\d+$/.test(range), range),
    ];
  };
  for (const [id, role] of [["LOCK-01", "anon"], ["LOCK-03", "free"]] as Array<[string, Role]>) {
    const restAuth = role === "anon" ? "anon" : "role";
    for (const [instance, query] of variants) {
      jobs.push(ctx.run({ id, instance, role, req: { target: "rest", path: "/deal_previews", query, restAuth }, check: lockedOut }));
    }
    for (const prefer of [null, "count=exact"]) {
      jobs.push(
        ctx.run({
          id: role === "anon" ? "LOCK-02" : "LOCK-03",
          instance: `HEAD${prefer ? ` ${prefer}` : ""}`,
          role,
          req: { target: "rest", method: "HEAD", path: "/deal_previews", headers: prefer ? { prefer } : {}, restAuth },
          check: lockedOut,
        }),
      );
    }
  }
  jobs.push(
    ctx.run({
      id: "LOCK-04",
      instance: "dealPreviewsCollection",
      role: "anon",
      req: { target: "graphql", method: "POST", path: "", json: { query: "{ dealPreviewsCollection { edges { node { dealId slug } } } }" }, restAuth: "anon" },
      check: (o) => [ok("absent_or_permission_error", o.final.status >= 400 || /error/i.test(o.final.body) || !/"slug"\s*:\s*"/.test(o.final.body), o.final.body.slice(0, 300))],
    }),
  );
}

function companyProfileId(ctx: Ctx, role: Role): string | null {
  const userId = ctx.session(role).userId;
  return ctx.psql(`select id from public.company_profiles where user_id = '${userId}' limit 1`) || null;
}

function a1Held(ctx: Ctx): boolean {
  return ctx.psql(`select exists (select 1 from private.preview_holds where deal_id = '${ctx.row("A1").deal_id}')`) === "t";
}

function writeFingerprint(ctx: Ctx): string {
  return ctx.psql(
    `select md5(coalesce((select string_agg(dp.deal_id::text || dp.is_published::text || dp.unpublished_by_admin::text || dp.preview_title, ',' order by dp.deal_id) from public.deal_previews dp), '')
       || coalesce((select string_agg(d.id::text || d.source_title, ',' order by d.id) from public.deals d), '')
       || coalesce((select string_agg(a.id::text || a.title || coalesce(a.message, ''), ',' order by a.id) from public.alerts a), ''))`,
  );
}

/** Non-anon public tables and every private.* object (REST-13 PRIVATE_NAMES). */
function privateObjectNames(ctx: Ctx): string[] {
  const names = ctx.psqlJson<Array<{ n: string }>>(
    `select tablename as n from pg_tables where schemaname = 'public' and not has_table_privilege('anon', format('public.%I', tablename), 'select')
     union select c.relname from pg_class c where c.relnamespace = 'private'::regnamespace and c.relkind in ('r', 'v', 'm')
     union select p.proname from pg_proc p where p.pronamespace = 'private'::regnamespace`,
  ).map((r) => r.n);
  // OQ-8: after 0019 a hint naming deal_previews is acceptable.
  return ctx.phase === "B" ? names.filter((n) => n !== "deal_previews") : names;
}

/** B-LOCK-05: allowlists and result sets identical to Phase A. */
export function lockCompare(ctx: Ctx, phaseA: Record<string, unknown>): void {
  const keys = Object.keys(phaseA).filter((k) => /^REST-0[1-4]\||^REST-16\|/.test(k));
  const diffs = keys.filter((k) => JSON.stringify(phaseA[k]) !== JSON.stringify(ctx.snapshots.get(k)));
  ctx.derive({
    id: "LOCK-05",
    instance: "rpc-results-vs-phase-A",
    role: "db",
    assertions: [ok("compared_any", keys.length > 0, keys.length), eq("identical_to_phase_A", [], diffs)],
  });
}

export { normalise as normaliseRows };
export type { EnumSets };
