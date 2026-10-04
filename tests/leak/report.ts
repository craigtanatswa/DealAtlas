/**
 * Sign-off artifacts (spec section 8) and the pass rule (section 7).
 *
 *   tsx tests/leak/report.ts
 *
 * Exits non-zero unless summary.json.pass.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ARTIFACTS_DIR, RAW_DIR, readJson, sha256, writeJson } from "./lib/artifacts";
import { LEAK_DIR, ROOT } from "./lib/env";
import type { ProbeRecord } from "./lib/probe";
import { compileTokens, heuristicHits, loadManifest, MANIFEST_PATH } from "./lib/scan";

type Waiver = { finding: string; reason: string; approved_by: string; expires: string };
type PhaseRecords = { phase: "A" | "B"; fatal: string | null; records: Array<ProbeRecord & { detail?: unknown }> };

const WAIVERS_PATH = path.join(ROOT, "tests/leak/waivers.json");
const HARNESS_FILES = ["tests/leak/lib", "tests/leak/probes", "tests/leak/selftest", "tests/leak/run.ts", "tests/leak/preflight.ts", "tests/leak/report.ts", "tests/leak/alerts-digest.ts"];
const SEED_FILES = ["tests/leak/seed/users.ts", "tests/leak/seed/world.sql", "tests/leak/seed/post-seed.sql"];

function git(...args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function filesUnder(rel: string): string[] {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [rel];
  return fs
    .readdirSync(abs)
    .flatMap((f) => filesUnder(path.join(rel, f)))
    .sort();
}

function hashFiles(rels: string[]): Record<string, string> {
  return Object.fromEntries(rels.flatMap(filesUnder).map((f) => [f, sha256(fs.readFileSync(path.join(ROOT, f)))]));
}

function readLeak(name: string): string | null {
  const file = path.join(LEAK_DIR, name);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : null;
}

function isResidual(r: ProbeRecord): boolean {
  return /(^|[^A-Z0-9])R[12]([^0-9]|$)/.test(r.instance);
}

function waiverFor(r: ProbeRecord, waivers: Waiver[]): Waiver | null {
  const key = `${r.probe_id}|${r.role}|${r.instance}`;
  const bare = r.probe_id.replace(/^[AB]-/, "");
  return waivers.find((w) => w.finding === r.probe_id || w.finding === bare || key.startsWith(`${w.finding}|`) || key === w.finding) ?? null;
}

function main(): void {
  const manifest = loadManifest();
  const waivers = (fs.existsSync(WAIVERS_PATH) ? (JSON.parse(fs.readFileSync(WAIVERS_PATH, "utf8")) as { waivers: Waiver[] }).waivers : []) ?? [];
  const now = new Date();
  const waiverErrors = waivers
    .filter((w) => w.approved_by !== "Reviewer" || Number.isNaN(Date.parse(w.expires)) || Date.parse(w.expires) < now.getTime())
    .map((w) => `${w.finding}: ${w.approved_by !== "Reviewer" ? "not approved by the Reviewer" : "expired or invalid expiry"}`);

  const phases = (["A", "B"] as const).map((p) => readJson<PhaseRecords>(`phase-${p}/records.json`));
  const preflight = readJson<{ pass: boolean; results: Array<{ id: string; pass: boolean }> }>("preflight/summary.json");
  const baseline = readJson<{ pass: boolean }>("preflight/PF-02.json");

  const failures: Array<Record<string, unknown>> = [];
  const waiversApplied: Array<Record<string, unknown>> = [];
  const residuals: Array<Record<string, unknown>> = [];
  const expectedExposures: Array<Record<string, unknown>> = [];
  const gateMisses: Array<Record<string, unknown>> = [];
  const proControls: Array<Record<string, unknown>> = [];
  const selfTests: Array<Record<string, unknown>> = [];
  const counts: Record<string, Record<string, Record<string, { pass: number; fail: number; waived: number }>>> = {};
  const rows = new Map<string, { phase: string; probe: string; role: string; instances: number; pass: number; fail: number; waived: number; tokens: Set<string>; notes: Set<string> }>();
  const heuristics: Record<string, { hits: number; examples: string[] }> = {};

  for (const phase of phases) {
    if (!phase) continue;
    for (const r of phase.records) {
      const waiver = !r.pass ? waiverFor(r, waivers) : null;
      const residual = isResidual(r);
      const waived = Boolean(!r.pass && (residual || (waiver && !waiverErrors.some((e) => e.startsWith(`${waiver.finding}:`)))));
      if (!r.pass && residual) residuals.push({ probe_id: r.probe_id, role: r.role, instance: r.instance, tokens: r.tokens_present });
      else if (!r.pass && waived) waiversApplied.push({ probe_id: r.probe_id, role: r.role, instance: r.instance, waiver });
      else if (!r.pass) {
        const codes = r.assertions.filter((a) => !a.pass && a.blocking !== false).map((a) => a.code ?? a.id);
        failures.push({ probe_id: r.probe_id, role: r.role, instance: r.instance, severity: r.severity, codes, url: r.url, tokens: r.tokens_present, record: `phase-${r.phase}/probes/` });
      }
      for (const e of r.expected_exposures) expectedExposures.push({ probe_id: r.probe_id, role: r.role, instance: r.instance, ...e });
      if (/-DB-03$/.test(r.probe_id)) gateMisses.push(...(((r.detail as { gate_misses?: unknown[] })?.gate_misses ?? []) as Array<Record<string, unknown>>).map((m) => ({ phase: r.phase, ...m })));
      if (r.role === "pro" && /PRO-|FLOW-04|ALERT-04/.test(r.probe_id)) proControls.push({ probe_id: r.probe_id, instance: r.instance, pass: r.pass, found: r.tokens_present });
      if (/-SELF$/.test(r.probe_id)) selfTests.push({ id: `SELF-${r.phase}`, pass: r.pass, assertions: r.assertions });

      const family = r.family;
      const fam = ((counts[r.phase] ??= {})[r.role] ??= {});
      const c = (fam[family] ??= { pass: 0, fail: 0, waived: 0 });
      if (r.pass) c.pass += 1;
      else if (waived) c.waived += 1;
      else c.fail += 1;
      const defId = r.probe_id.replace(/:.*/, "");
      const key = `${defId}|${r.phase}|${r.role}`;
      const row = rows.get(key) ?? { phase: r.phase, probe: defId, role: r.role, instances: 0, pass: 0, fail: 0, waived: 0, tokens: new Set<string>(), notes: new Set<string>() };
      row.instances += 1;
      if (r.pass) row.pass += 1;
      else if (waived) row.waived += 1;
      else row.fail += 1;
      r.tokens_present.forEach((t) => row.tokens.add(t));
      if (r.expected_exposures.length) row.notes.add("expected exposure (OQ-9)");
      if (!r.pass) r.assertions.filter((a) => !a.pass && a.blocking !== false).forEach((a) => row.notes.add(a.code ?? a.id));
      rows.set(key, row);

      if (r.role !== "pro" && r.raw_path) {
        const file = path.join(RAW_DIR, r.raw_path);
        if (fs.existsSync(file)) {
          for (const [name, found] of Object.entries(heuristicHits(fs.readFileSync(file, "utf8")))) {
            const h = (heuristics[name] ??= { hits: 0, examples: [] });
            h.hits += found.length;
            for (const f of found) if (h.examples.length < 10 && !h.examples.includes(f)) h.examples.push(f);
          }
        }
      }
    }
  }

  const missing: string[] = [];
  if (!baseline?.pass) missing.push("PF-02 baseline crawl failed or missing");
  if (!preflight?.pass) missing.push("pre-flight failed or missing");
  for (const [i, p] of phases.entries()) {
    const name = i === 0 ? "A" : "B";
    if (!p) missing.push(`phase ${name} did not run`);
    else if (p.fatal) missing.push(`phase ${name}: ${p.fatal}`);
    else if (p.records.length === 0) missing.push(`phase ${name} produced no records`);
  }
  for (const id of ["SELF-A", "SELF-B"]) if (!selfTests.some((s) => s.id === id)) missing.push(`${id} missing`);
  const pass = failures.length === 0 && missing.length === 0 && waiverErrors.length === 0;

  const migrations = (p: "A" | "B") => readJson<Array<{ version: string }>>(`phase-${p}/migrations.json`)?.map((m) => m.version) ?? [];
  const run = {
    pr_number: process.env.LEAK_PR_NUMBER ? Number(process.env.LEAK_PR_NUMBER) : null,
    head_sha: process.env.LEAK_HEAD_SHA || git("rev-parse", "HEAD"),
    base_sha: process.env.LEAK_BASE_SHA || null,
    merge_sha: process.env.GITHUB_REF?.endsWith("/merge") ? process.env.GITHUB_SHA ?? null : null,
    app_commit_sha: git("rev-parse", "HEAD"),
    next_build_id: { A: readLeak("build-id-A"), B: readLeak("build-id-B") },
    node_version: process.version,
    supabase_cli_version: spawnSync("npx", ["supabase", "--version"], { encoding: "utf8" }).stdout?.split("\n")[0]?.trim() ?? null,
    postgres_version: process.env.DB_URL ? spawnSync("psql", [process.env.DB_URL, "-XAtc", "show server_version"], { encoding: "utf8" }).stdout.trim() : null,
    ci_run_url: process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/attempts/${process.env.GITHUB_RUN_ATTEMPT}`
      : null,
    started_at_utc: readLeak("started-at"),
    finished_at_utc: now.toISOString(),
    include_residuals: process.env.LEAK_INCLUDE_RESIDUALS === "1",
    migrations_phase_A: migrations("A"),
    migrations_phase_B: migrations("B"),
    sha256: { manifest: sha256(fs.readFileSync(MANIFEST_PATH)), seed: hashFiles(SEED_FILES), harness: hashFiles(HARNESS_FILES) },
  };
  if (run.next_build_id.A && run.next_build_id.B && run.next_build_id.A !== run.next_build_id.B) missing.push("BUILD_ID changed between phases");
  const finalPass = pass && missing.length === 0;

  const summary = {
    pass: finalPass,
    blocking_reasons: [...missing, ...waiverErrors, ...(failures.length ? [`${failures.length} failing probe record(s)`] : [])],
    counts,
    failures,
    gate_misses: gateMisses,
    expected_exposures: expectedExposures,
    waivers_applied: waiversApplied,
    residuals,
    pro_positive_controls: proControls,
    self_tests: [...(preflight?.results ?? []), ...selfTests.map((s) => ({ id: s.id, pass: s.pass }))],
    heuristics,
  };

  writeJson("run.json", run);
  writeJson("summary.json", summary);
  writeJson("manifest/tokens.json", manifest);
  writeJson("manifest/tokens.expanded.json", compileTokens(manifest).map((c) => ({ id: c.token.id, patterns: c.patterns.map((p) => p.source), squashed: c.squashed })));
  writeJson("manifest/waivers.json", { waivers, errors: waiverErrors });
  const outcome = readLeak("seed-outcome.json");
  if (outcome) writeJson("seed/seed-outcome.json", JSON.parse(outcome));
  const users = readLeak("users.json");
  if (users) writeJson("seed/users.json", JSON.parse(users));
  fs.mkdirSync(path.join(ARTIFACTS_DIR, "seed"), { recursive: true });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, "seed/sha256.txt"), Object.entries(hashFiles(SEED_FILES)).map(([f, h]) => `${h}  ${f}`).join("\n") + "\n");

  const md: string[] = [];
  md.push(`# Leak probes: ${finalPass ? "PASS" : "FAIL"}`, "");
  md.push(`Head \`${run.head_sha}\`. Build ${run.next_build_id.A ?? "?"} / ${run.next_build_id.B ?? "?"}. Migrations A: ${run.migrations_phase_A.at(-1) ?? "?"}, B: ${run.migrations_phase_B.at(-1) ?? "?"}.`, "");
  if (summary.blocking_reasons.length) md.push("**Blocking:**", ...summary.blocking_reasons.map((r) => `- ${r}`), "");
  md.push("| Probe | Phase | Role | Instances | Pass | Fail | Waived | Tokens hit | Notes |", "|---|---|---|---|---|---|---|---|---|");
  for (const row of [...rows.values()].sort((a, b) => a.phase.localeCompare(b.phase) || a.probe.localeCompare(b.probe) || a.role.localeCompare(b.role))) {
    md.push(`| ${row.probe} | ${row.phase} | ${row.role} | ${row.instances} | ${row.pass} | ${row.fail} | ${row.waived} | ${[...row.tokens].sort().join(" ")} | ${[...row.notes].join("; ")} |`);
  }
  md.push("", "## Gate misses", gateMisses.length ? gateMisses.map((g) => `- ${g.phase} ${g.row}: ${(g.tokens as string[]).join(", ")}`).join("\n") : "None.");
  md.push("", "## Phase A expected exposures (OQ-9)", expectedExposures.length ? `${expectedExposures.length} record(s): ${[...new Set(expectedExposures.map((e) => `${e.probe_id} ${e.token_id}`))].join(", ")}` : "None.");
  md.push("", "## Pro positive controls", ...proControls.map((p) => `- ${p.probe_id} ${p.instance}: ${p.pass ? "found" : "MISSING"}`));
  md.push("", "## Self-tests", ...summary.self_tests.map((s) => `- ${s.id}: ${s.pass ? "pass" : "FAIL"}`));
  md.push("", "## Waivers applied", waiversApplied.length ? waiversApplied.map((w) => `- ${w.probe_id} ${w.role} ${w.instance}`).join("\n") : "None.");
  md.push("", "## Residuals (non-blocking)", residuals.length ? residuals.map((r) => `- ${r.probe_id} ${r.role} ${r.instance}`).join("\n") : "None.");
  if (failures.length) {
    md.push("", "## Failures (first 50)", ...failures.slice(0, 50).map((f) => `- ${f.probe_id} ${f.role} ${f.instance}: ${(f.codes as string[]).join(", ")}`));
  }
  const markdown = `${md.join("\n")}\n`;
  fs.writeFileSync(path.join(ARTIFACTS_DIR, "summary.md"), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown.slice(0, 900_000));

  if (fs.existsSync(RAW_DIR)) {
    const sha7 = (run.head_sha ?? "local").slice(0, 7);
    const tarName = `leak-raw-${sha7}-${process.env.GITHUB_RUN_ID ?? "local"}.tar.gz`;
    execFileSync("tar", ["-czf", path.join(ARTIFACTS_DIR, tarName), "-C", ARTIFACTS_DIR, "raw"]);
    fs.rmSync(RAW_DIR, { recursive: true, force: true });
  }
  console.log(markdown.split("\n").slice(0, 6).join("\n"));
  console.log(`summary.json pass=${finalPass}; ${failures.length} failure(s)`);
  process.exit(finalPass ? 0 : 1);
}

main();
