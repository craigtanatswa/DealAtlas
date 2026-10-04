/**
 * One probe phase (spec sections 5 and 6).
 *
 *   tsx --import ./scripts/allow-server-only.mjs tests/leak/run.ts --phase A|B
 *
 * Writes leak-artifacts/phase-<X>/{probes/*.json, records.json, snapshots.json,
 * migrations.json, acl.json, seed-outcome.json} and the raw dumps.
 */
import { readJson, writeJson } from "./lib/artifacts";
import { loadContext } from "./lib/context";
import type { Ctx, Phase, ProbeOutcome } from "./lib/probe";
import { eq, ok } from "./lib/probe";
import { FREE_ROLES } from "./lib/scan";
import { digestProbes, mailProbes } from "./probes/alerts";
import { alertProbes, apiProbes, appProbes, proProbes } from "./probes/api";
import { clientProbes } from "./probes/client";
import { aclDiff, dbProbes, type Acl } from "./probes/db";
import { flowProbes } from "./probes/flow";
import { lockCompare, normaliseRows, restProbes } from "./probes/rest";
import { htmlProbes, metaExtraProbes, rscHandBuiltProbes, seoProbes } from "./probes/web";

function phaseArg(): Phase {
  const at = process.argv.indexOf("--phase");
  const value = at >= 0 ? process.argv[at + 1] : "";
  if (value !== "A" && value !== "B") throw new Error("usage: run.ts --phase A|B");
  return value;
}

/** SELF-A / SELF-B: T32 must be found for anon wherever decoding or capture could silently break. */
function selfTest(ctx: Ctx): void {
  const b1 = "B1";
  const has = (o: ProbeOutcome | undefined, layer?: "L0" | "L3") => Boolean(o && (layer ? o.scan.tokens.get("T32")?.counts[layer] : o.scan.tokens.has("T32")));
  const firstApi = [...ctx.outcomes.entries()].find(([k]) => k.startsWith("API-01|anon|limit="))?.[1];
  ctx.derive({
    id: "SELF",
    instance: "T32-present",
    role: "anon",
    assertions: [
      ok("deals_B1_html_L0", has(ctx.outcome("HTML-03", "anon", b1), "L0")),
      ok("deals_B1_next_f_L3", has(ctx.outcome("HTML-03", "anon", b1), "L3")),
      ok("deals_B1_rsc", has(ctx.outcome("RSC-01", "anon", b1))),
      ok("api_search_json", has(firstApi)),
      ok("rest_get_preview_dto_by_slug", has(ctx.outcome("REST-02", "anon", b1))),
      ok("deals_listing", has(ctx.outcome("HTML-02", "anon", "page-1"))),
    ],
  });
}

/** HDR-01/HDR-02 aggregates over every probe's header assertions. */
function headerAggregates(ctx: Ctx): void {
  for (const [id, assertion] of [["HDR-01", "headers_nt"], ["HDR-02", "hdr02_nt"]] as const) {
    const relevant = ctx.records.filter((r) => r.assertions.some((a) => a.id === assertion));
    const failing = relevant.filter((r) => r.assertions.some((a) => a.id === assertion && !a.pass)).map((r) => `${r.probe_id}|${r.role}|${r.instance}`);
    ctx.derive({ id, instance: "all-probes", role: "anon", assertions: [ok("checked_any", relevant.length > 0, relevant.length), eq("failing", [], failing)] });
  }
}

const DETERMINISTIC = /^(?:REST-0[1-5]|REST-16|API-01|SEO-0[23])\|/;

function deterministicSnapshots(ctx: Ctx): Record<string, unknown> {
  const out: Record<string, unknown> = Object.fromEntries(ctx.snapshots);
  for (const [key, o] of ctx.outcomes) {
    if (!DETERMINISTIC.test(key) || key in out) continue;
    out[key] = { status: o.final.status, body: o.json !== undefined ? normaliseRows(o) : o.final.body };
  }
  return out;
}

function crossPhase(ctx: Ctx, phaseA: Record<string, unknown>, snapshots: Record<string, unknown>): void {
  lockCompare(ctx, phaseA);
  const keys = Object.keys(phaseA).filter((k) => DETERMINISTIC.test(k) && !k.startsWith("REST-08") && !k.startsWith("REST-09"));
  const diffs = keys.filter((k) => JSON.stringify(phaseA[k]) !== JSON.stringify(snapshots[k]));
  ctx.derive({ id: "XPH-01", instance: "deterministic-probes", role: "db", assertions: [ok("compared_any", keys.length > 0, keys.length), eq("equal", [], diffs)] });
  const aclA = readJson<Acl>("phase-A/acl.json");
  const aclB = readJson<Acl>("phase-B/acl.json");
  const diff = aclA && aclB ? aclDiff(aclA, aclB) : null;
  ctx.derive({
    id: "XPH-02",
    instance: "acl-diff",
    role: "db",
    assertions: [ok("both_acl_snapshots", Boolean(diff)), eq("only_intended_changes", [], diff?.unintended ?? ["missing ACL snapshot"])],
    detail: diff,
  });
}

async function step(ctx: Ctx, name: string, fn: () => Promise<unknown> | unknown): Promise<void> {
  const started = Date.now();
  try {
    await fn();
  } catch (error) {
    ctx.derive({ id: "HARNESS", instance: name, role: "db", assertions: [ok("step_completed", false, String(error))] });
  }
  console.log(`[${ctx.phase}] ${name}: ${((Date.now() - started) / 1000).toFixed(1)}s, ${ctx.records.length} records`);
}

async function main(): Promise<void> {
  const phase = phaseArg();
  const { ctx, checks } = await loadContext(phase);
  for (const check of checks) {
    ctx.derive({ id: "SESSION", instance: "check", role: check.role, assertions: [ok("session_valid", check.pass, check, { code: check.pass ? undefined : "SESSION_INVALID" })] });
  }
  const finish = (fatal?: string) => {
    const snapshots = deterministicSnapshots(ctx);
    if (phase === "B") {
      const phaseA = readJson<Record<string, unknown>>("phase-A/snapshots.json");
      if (phaseA && !fatal) crossPhase(ctx, phaseA, snapshots);
    }
    writeJson(`${ctx.dir}/snapshots.json`, snapshots);
    writeJson(`${ctx.dir}/records.json`, { phase, fatal: fatal ?? null, records: ctx.records });
    const failed = ctx.records.filter((r) => !r.pass);
    console.log(`[${phase}] ${ctx.records.length} records, ${failed.length} failing${fatal ? `; fatal: ${fatal}` : ""}`);
  };
  if (!checks.every((c) => c.pass)) {
    finish("SESSION_INVALID");
    return;
  }
  const phaseA = phase === "B" ? readJson<Record<string, unknown>>("phase-A/snapshots.json") : null;
  try {
    dbProbes(ctx, { holds: phaseA?.["DB-04|holds"] as string[] | undefined });
  } catch (error) {
    finish(String(error).includes("SEED_INVALID") ? "SEED_INVALID" : String(error));
    return;
  }

  await step(ctx, "html+rest+api+app+alerts+pro", async () => {
    const settled = await Promise.allSettled([
      htmlProbes(ctx),
      metaExtraProbes(ctx),
      rscHandBuiltProbes(ctx),
      apiProbes(ctx),
      appProbes(ctx),
      alertProbes(ctx, FREE_ROLES),
      restProbes(ctx),
      proProbes(ctx),
    ]);
    const rejected = settled.find((item) => item.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
  });
  await step(ctx, "seo", () => seoProbes(ctx));
  await step(ctx, "digest", () => digestProbes(ctx));
  await step(ctx, "mail", () => mailProbes(ctx));
  if (phase === "B") await step(ctx, "flow", () => flowProbes(ctx));
  await step(ctx, "client", () => clientProbes(ctx));
  selfTest(ctx);
  headerAggregates(ctx);
  finish();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
