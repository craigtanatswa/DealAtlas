/**
 * MATCH-01..04 (0051, P0 anti-bypass): match scores, reasons and match
 * ordering are Pro-only. Real free and Pro sessions, HTML, RSC and API.
 * Every recorded value is a count; no slug, score or body text is stored.
 */
import type { Ctx, ProbeOutcome } from "../lib/probe";
import { eq, ok, slugsIn } from "../lib/probe";
import type { Role } from "../lib/scan";
import { heldSlugs, pubSlugs } from "./common";

/** JSON keys that carry match data. Escaped quotes cover RSC/inline JSON. */
export const MATCH_KEYS = ["score", "reasons", "matchScore", "matchReasons", "relevance_score", "preview_reasons"];
const MATCH_KEY_RE = new RegExp(`\\\\*"(${MATCH_KEYS.join("|")})\\\\*"\\s*:`, "g");

export function matchKeyCount(text: string): number {
  return [...text.matchAll(MATCH_KEY_RE)].length;
}

const FREE_MATCH_ROLES: Role[] = ["free", "free_lapsed"];
const VARIANTS = ["", "sort=biddable", "sort=relevance&minScore=90"] as const;

type Surface = { name: string; path: string; kind: "html" | "rsc" | "api" };

function surfaces(): Surface[] {
  const out: Surface[] = [];
  for (const path of ["/", "/deals", "/app/search"]) {
    out.push({ name: `${path}@html`, path, kind: "html" }, { name: `${path}@rsc`, path, kind: "rsc" });
  }
  out.push({ name: "/api/search", path: "/api/search", kind: "api" });
  return out;
}

function withQuery(path: string, variant: string): { path: string; query?: Array<[string, string]> } {
  if (!variant) return { path };
  return { path, query: variant.split("&").map((kv) => kv.split("=") as [string, string]) };
}

function order(ctx: Ctx, o: ProbeOutcome, kind: Surface["kind"]): string[] {
  const known = new Set([...pubSlugs(ctx), ...heldSlugs(ctx)]);
  if (kind === "api") {
    const items = (o.json as { items?: Array<{ slug?: unknown }> } | undefined)?.items ?? [];
    return items.map((item) => String(item.slug)).filter((slug) => known.has(slug));
  }
  return [...slugsIn(o.final.body)].filter((slug) => known.has(slug));
}

export async function matchProbes(ctx: Ctx): Promise<void> {
  const b1 = ctx.row("B1");
  const orders = new Map<string, string[]>();
  const freeJobs: Array<Promise<unknown>> = [];

  for (const role of FREE_MATCH_ROLES) {
    for (const s of surfaces()) {
      for (const variant of VARIANTS) {
        const q = withQuery(s.path, variant);
        freeJobs.push(
          ctx
            .run({
              id: "MATCH-01",
              instance: `${s.name}?${variant || "default"}`,
              role,
              req: { ...q, rsc: s.kind === "rsc" ? "rsc" : undefined },
              requireRsc: s.kind === "rsc",
              status: [200],
              check: (o) => [eq("match_key_count", 0, matchKeyCount(o.final.body))],
            })
            .then((o) => orders.set(`${role}|${s.name}|${variant}`, order(ctx, o, s.kind))),
        );
      }
    }
    // One deal detail, public and in-app, HTML and RSC.
    for (const path of [`/deals/${b1.slug}`, `/app/deals/${b1.deal_id}`]) {
      for (const rsc of [undefined, "rsc"] as const) {
        freeJobs.push(
          ctx.run({
            id: "MATCH-02",
            instance: `${path === `/deals/${b1.slug}` ? "/deals/B1" : "/app/deals/B1"}@${rsc ?? "html"}`,
            role,
            req: { path, rsc },
            requireRsc: rsc === "rsc",
            check: (o) => [eq("match_key_count", 0, matchKeyCount(o.final.body))],
          }),
        );
      }
    }
  }

  let proKeys = 0;
  const proJobs: Array<Promise<unknown>> = [];
  for (const [instance, path, query, rsc] of [
    ["/app/search?sort=relevance@html", "/app/search", [["sort", "relevance"]], undefined],
    ["/app/search?sort=relevance@rsc", "/app/search", [["sort", "relevance"]], "rsc"],
    ["/app/deals/B1@html", `/app/deals/${b1.deal_id}`, undefined, undefined],
    ["/app/deals/B1@rsc", `/app/deals/${b1.deal_id}`, undefined, "rsc"],
  ] as Array<[string, string, Array<[string, string]> | undefined, "rsc" | undefined]>) {
    proJobs.push(
      ctx
        .run({ id: "MATCH-04", instance, role: "pro", req: { path, query, rsc }, requireRsc: rsc === "rsc", status: [200] })
        .then((o) => {
          proKeys += matchKeyCount(o.final.body);
        }),
    );
  }

  await Promise.all([...freeJobs, ...proJobs]);

  // MATCH-03: free ordering never depends on the profile or on sort/minScore.
  let compared = 0;
  let nonEmpty = 0;
  let mismatches = 0;
  for (const s of surfaces()) {
    const base = orders.get(`free|${s.name}|`) ?? [];
    if (base.length > 0) nonEmpty += 1;
    for (const role of FREE_MATCH_ROLES) {
      for (const variant of VARIANTS) {
        const got = orders.get(`${role}|${s.name}|${variant}`) ?? [];
        compared += 1;
        if (JSON.stringify(got) !== JSON.stringify(base)) mismatches += 1;
      }
    }
  }
  ctx.derive({
    id: "MATCH-03",
    instance: "free-ordering",
    role: "free",
    assertions: [
      ok("compared_any", compared > 0, compared),
      ok("surfaces_with_cards", nonEmpty >= 3, nonEmpty),
      eq("ordering_mismatches", 0, mismatches),
    ],
  });
  ctx.derive({
    id: "MATCH-04",
    instance: "pro-keeps-scores",
    role: "pro",
    assertions: [ok("pro_match_key_count_positive", proKeys > 0, proKeys)],
  });
}
