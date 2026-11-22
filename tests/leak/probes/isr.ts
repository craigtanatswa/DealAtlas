/**
 * ISR probes: the public pages and viewer APIs must render only anonymous,
 * sanitised data even after a signed-in request populates the cache.
 */
import { header, type HttpHop } from "../lib/http";
import type { Assertion, Ctx, ProbeOutcome } from "../lib/probe";
import { eq, ok } from "../lib/probe";
import { purgePublicPreviewCache } from "../lib/revalidate";
import type { Role } from "../lib/scan";
import { PUB_ROWS, heldRows } from "./common";
import { matchKeyCount } from "./match";

const DEAL_ID_KEY = /\\*"dealId\\*"\s*:/i;
const DEAL_ID_UUID =
  /\\*"dealId\\*"\s*:\s*\\*"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\*"/i;
const REVEAL_HREF = /revealHref/i;
const APP_DEAL_HREF =
  /\/app\/deals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const SESSION_COOKIE = /sb-|session/i;

const VIEWER_FORBIDDEN_KEYS = ["match", "revealHref", "returnTo"];

function decodedLayers(o: ProbeOutcome): string {
  const { layers } = o.scan;
  return [
    layers.L0,
    layers.L1,
    layers.L2,
    layers.L3,
    layers.L4,
    layers.L5,
    layers.L6,
    layers.L7,
  ].join("\n");
}

function sessionCookieSet(o: ProbeOutcome): boolean {
  return o.result.hops.some((hop) =>
    hop.headers.some(
      ([name, value]) => name === "set-cookie" && SESSION_COOKIE.test(value),
    ),
  );
}

function publicRenderAssertions(o: ProbeOutcome): Assertion[] {
  const text = decodedLayers(o);
  return [
    ok("no_dealId_key", !DEAL_ID_KEY.test(text) && !DEAL_ID_UUID.test(text)),
    ok("no_revealHref", !REVEAL_HREF.test(text)),
    ok("no_app_deal_href", !APP_DEAL_HREF.test(text)),
    eq("match_key_count", 0, matchKeyCount(o.final.body)),
    ok("no_session_set_cookie", !sessionCookieSet(o)),
  ];
}

function isCached(o: ProbeOutcome): boolean {
  const nextCache = header(o.final, "x-nextjs-cache")?.toUpperCase() ?? "";
  const vercelCache = header(o.final, "x-vercel-cache")?.toUpperCase() ?? "";
  const age = Number(header(o.final, "age") ?? "0");
  return (
    nextCache === "HIT" ||
    nextCache === "STALE" ||
    vercelCache === "HIT" ||
    vercelCache === "STALE" ||
    (Number.isFinite(age) && age > 0)
  );
}

function cachedAssertion(o: ProbeOutcome): Assertion {
  const hop: HttpHop = o.final;
  return ok("cached", isCached(o), {
    "x-nextjs-cache": header(hop, "x-nextjs-cache"),
    "x-vercel-cache": header(hop, "x-vercel-cache"),
    age: header(hop, "age"),
  });
}

function noStoreAssertions(o: ProbeOutcome): Assertion[] {
  const value = (header(o.final, "cache-control") ?? "").toLowerCase();
  return [
    ok(
      "cache_control_no_store",
      value.includes("no-store") &&
        !value.includes("public") &&
        !value.includes("s-maxage"),
      value,
    ),
  ];
}

async function twice(
  ctx: Ctx,
  input: {
    id: string;
    label: string;
    role: Role;
    path: string;
    rsc?: "rsc";
    extra: (o: ProbeOutcome) => Assertion[];
  },
): Promise<void> {
  const kind = input.rsc ?? "html";
  await ctx.run({
    id: input.id,
    instance: `${input.label}@${kind}#1`,
    role: input.role,
    req: { path: input.path, rsc: input.rsc },
    status: [200],
    requireRsc: Boolean(input.rsc),
    check: (o) => input.extra(o),
  });
  await ctx.run({
    id: input.id,
    instance: `${input.label}@${kind}#2`,
    role: input.role,
    req: { path: input.path, rsc: input.rsc },
    status: [200],
    requireRsc: Boolean(input.rsc),
    check: (o) => [...input.extra(o), cachedAssertion(o)],
  });
}

async function missThenHit(
  ctx: Ctx,
  input: {
    id: string;
    label: string;
    role: Role;
    path: string;
    rsc?: "rsc";
    extra: (o: ProbeOutcome) => Assertion[];
    cached?: boolean;
  },
): Promise<ProbeOutcome> {
  const kind = input.rsc ?? "html";
  return ctx.run({
    id: input.id,
    instance: `${input.label}@${kind}`,
    role: input.role,
    req: { path: input.path, rsc: input.rsc },
    status: [200],
    requireRsc: Boolean(input.rsc),
    check: (o) => [
      ...input.extra(o),
      ...(input.cached ? [cachedAssertion(o)] : []),
    ],
  });
}

export async function isrProbes(ctx: Ctx): Promise<void> {
  await purgePublicPreviewCache(ctx.env.appUrl);

  // ISR-01: a purge makes the next request a MISS and the one after a HIT.
  await twice(ctx, {
    id: "ISR-01",
    label: "home",
    role: "anon",
    path: "/",
    extra: publicRenderAssertions,
  });
  for (const rowId of PUB_ROWS) {
    const row = ctx.row(rowId);
    for (const rsc of [undefined, "rsc"] as const) {
      await twice(ctx, {
        id: "ISR-01",
        label: rowId,
        role: "anon",
        path: `/deals/${row.slug}`,
        rsc,
        extra: publicRenderAssertions,
      });
    }
  }

  // ISR-02: a Pro request must not poison the shared cache entry.
  const b1 = ctx.row("B1");
  await purgePublicPreviewCache(ctx.env.appUrl, [b1.slug]);
  for (const rsc of [undefined, "rsc"] as const) {
    await missThenHit(ctx, {
      id: "ISR-02",
      label: "B1@pro",
      role: "pro",
      path: `/deals/${b1.slug}`,
      rsc,
      extra: (o) => [
        ok("no_dealId_key", !DEAL_ID_KEY.test(decodedLayers(o))),
        ok("no_revealHref", !REVEAL_HREF.test(decodedLayers(o))),
        eq("match_key_count", 0, matchKeyCount(o.final.body)),
      ],
    });
  }
  for (const rsc of [undefined, "rsc"] as const) {
    await missThenHit(ctx, {
      id: "ISR-02",
      label: "B1@anon",
      role: "anon",
      path: `/deals/${b1.slug}`,
      rsc,
      cached: true,
      extra: publicRenderAssertions,
    });
  }

  // ISR-03: the viewer APIs stay private, typed and no-store for every role.
  const roles: Role[] = ["anon", "free", "free_lapsed", "free_expired", "pro"];
  for (const role of roles) {
    await ctx.run({
      id: "ISR-03",
      instance: `me@${role}`,
      role,
      req: { path: "/api/me" },
      status: [200],
      check: (o) => {
        const json = o.json as Record<string, unknown> | undefined;
        return [
          eq("keys", ["authenticated"], Object.keys(json ?? {}).sort()),
          eq("authenticated", role !== "anon", json?.authenticated),
          ...noStoreAssertions(o),
        ];
      },
    });
    await ctx.run({
      id: "ISR-03",
      instance: `deal-viewer@${role}`,
      role,
      req: { path: `/api/deals/${b1.slug}/viewer` },
      status: role === "anon" ? [401] : [200],
      check: (o) => {
        const json = o.json as Record<string, unknown> | undefined;
        const out: Assertion[] = [...noStoreAssertions(o)];
        if (role === "anon") {
          out.push(
            eq("keys", ["error"], Object.keys(json ?? {}).sort()),
          );
        } else if (role === "pro") {
          out.push(
            eq("mode", "pro", json?.mode),
            eq("revealHref", `/app/deals/${b1.deal_id}`, json?.revealHref),
          );
        } else {
          out.push(
            eq("mode", "free", json?.mode),
            eq(
              "no_pro_keys",
              [],
              Object.keys(json ?? {}).filter((key) =>
                VIEWER_FORBIDDEN_KEYS.includes(key),
              ),
            ),
          );
        }
        return out;
      },
    });
  }

  // ISR-04: held rows stay unpublished for anonymous pages and free viewers.
  for (const rowId of heldRows()) {
    const row = ctx.row(rowId);
    for (const attempt of [1, 2]) {
      await ctx.run({
        id: "ISR-04",
        instance: `${rowId}@html#${attempt}`,
        role: "anon",
        req: { path: `/deals/${row.slug}` },
        status: (status) => status === 404 || status === 200,
        check: (o) => [
          ok(
            "unpublished_not_served",
            o.final.status === 404 ||
              (o.final.status === 200 &&
                /<title>[^<]*Opportunity not found/i.test(o.final.body)),
            o.final.status,
          ),
        ],
      });
    }
    await ctx.run({
      id: "ISR-04",
      instance: `${rowId}@viewer`,
      role: "free",
      req: { path: `/api/deals/${row.slug}/viewer` },
      status: [404],
      check: noStoreAssertions,
    });
  }
}
