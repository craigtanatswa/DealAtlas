/** Phase B flows (B-FLOW-01..04): the lockdown keeps signed-in and Pro paths working. */
import type { Ctx, ProbeOutcome } from "../lib/probe";
import { eq, ok, slugsIn } from "../lib/probe";
import { mustFind, proProbes } from "./api";
import { pubSlugs } from "./common";
import { previewTitles } from "./web";

function savedLists(o: ProbeOutcome, title: string | undefined, dealId: string): boolean {
  const text = o.scan.layers.L5;
  return text.includes(dealId) || (title ? text.includes(title.toLowerCase()) : false);
}

/** FLOW-01, FLOW-02 (REST half; the UI save is in client.ts), FLOW-03, FLOW-04. */
export async function flowProbes(ctx: Ctx): Promise<void> {
  const titles = previewTitles(ctx);
  const b1 = ctx.row("B1");
  const b2 = ctx.row("B2");
  const freeId = ctx.session("free").userId!;

  await ctx.run({
    id: "FLOW-01",
    instance: "B1",
    role: "free",
    req: { path: `/deals/${b1.slug}` },
    status: [200],
    check: (o) => [
      ok("save_dealId_is_B1", o.scan.layers.L3.includes(`"dealId":"${b1.deal_id}"`), o.scan.layers.L3.match(/"dealId":[^,}]*/g)?.slice(0, 3)),
      ok("revealHref_is_app_deal", o.scan.layers.L3.includes(`/app/deals/${b1.deal_id}`), o.scan.layers.L3.match(/"revealHref":[^,}]*/g)?.slice(0, 3)),
    ],
  });

  // FLOW-02 (REST): save B2, see it in /app/saved, unsave it so the UI flow can save it again.
  await ctx.run({
    id: "FLOW-02",
    instance: "rest-save-B2",
    role: "free",
    req: { target: "rest", method: "POST", path: "/saved_deals", json: { user_id: freeId, deal_id: b2.deal_id }, headers: { prefer: "return=minimal" } },
    status: [201],
  });
  await ctx.run({
    id: "FLOW-02",
    instance: "app-saved-after-rest",
    role: "free",
    req: { path: "/app/saved" },
    status: [200],
    check: (o) => [ok("lists_B2", savedLists(o, titles.get("B2"), b2.deal_id))],
  });
  await ctx.run({
    id: "FLOW-02",
    instance: "rest-unsave-B2",
    role: "free",
    req: { target: "rest", method: "DELETE", path: "/saved_deals", query: [["deal_id", `eq.${b2.deal_id}`], ["user_id", `eq.${freeId}`]] },
    status: [204],
  });
  await ctx.run({
    id: "FLOW-02",
    instance: "display_name",
    role: "free",
    req: { target: "rest", method: "PATCH", path: "/profiles", query: [["id", `eq.${freeId}`]], json: { display_name: "Leakprobe Free" }, headers: { prefer: "return=minimal" } },
    status: [204],
    check: () => [eq("display_name_updated", "Leakprobe Free", ctx.psql(`select display_name from public.profiles where id = '${freeId}'`))],
  });
  // Free allows one saved search; replace the seeded one, then restore it.
  const seeded = ctx.psqlJson<Array<{ name: string; filters: unknown; alert_cadence: string }>>(
    `select name, filters, alert_cadence from public.saved_searches where user_id = '${freeId}'`,
  );
  ctx.psql(`delete from public.saved_searches where user_id = '${freeId}'`);
  await ctx.run({
    id: "FLOW-02",
    instance: "saved-search",
    role: "free",
    req: {
      target: "rest",
      method: "POST",
      path: "/saved_searches",
      json: { user_id: freeId, name: "Leakprobe grounds", filters: { query: "grounds" }, alert_cadence: "WEEKLY" },
      headers: { prefer: "return=minimal" },
    },
    status: [201],
  });
  await ctx.run({ id: "FLOW-02", instance: "app-searches", role: "free", req: { path: "/app/searches" }, status: [200], check: (o) => [ok("lists_saved_search", o.scan.layers.L5.includes("leakprobe grounds"))] });
  ctx.psql(`delete from public.saved_searches where user_id = '${freeId}'`);
  for (const s of seeded) {
    ctx.psql(
      `insert into public.saved_searches (user_id, name, filters, alert_cadence) values ('${freeId}', $q$${s.name}$q$, $q$${JSON.stringify(s.filters)}$q$::jsonb, '${s.alert_cadence}')`,
    );
  }
  await ctx.run({ id: "FLOW-02", instance: "app-alerts", role: "free", req: { path: "/app/alerts" }, status: [200] });

  await ctx.run({
    id: "FLOW-03",
    instance: "watch-O1",
    role: "free_lapsed",
    req: {
      target: "rest",
      method: "POST",
      path: "/watched_organizations",
      json: { user_id: ctx.session("free_lapsed").userId, organization_id: ctx.manifest.orgs.O1, watch_type: "BUYER" },
    },
    status: (s) => s >= 400,
    check: () => [
      eq("no_watch_row", "0", ctx.psql(`select count(*) from public.watched_organizations where user_id = '${ctx.session("free_lapsed").userId}'`)),
    ],
  });

  await proProbes(ctx, "FLOW-04");
  await ctx.run({
    id: "FLOW-04",
    family: "FLOW",
    instance: "export-B1",
    role: "pro",
    req: { method: "POST", path: "/api/exports", json: { dealIds: [b1.deal_id] } },
    status: [200],
    check: (o) => [ok("csv", o.final.contentType.includes("text/csv"), o.final.contentType), ...mustFind(o, [["T01"]])],
  });
  const pub = pubSlugs(ctx);
  await ctx.run({
    id: "FLOW-04",
    family: "FLOW",
    instance: "/app/search?q=grounds",
    role: "pro",
    req: { path: "/app/search", query: [["q", "grounds"]] },
    status: [200],
    check: (o) => {
      const ids = [...o.final.body.matchAll(/\/app\/deals\/([0-9a-f-]{36})/g)].map((m) => m[1]);
      const slugs = [...slugsIn(o.final.body)].filter((s) => pub.has(s));
      return [ok("has_results", ids.length + slugs.length > 0, { ids: ids.slice(0, 3), slugs })];
    },
  });
}
