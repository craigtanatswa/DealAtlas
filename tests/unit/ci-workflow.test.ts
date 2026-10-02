import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findProductionEnvViolations } from "@/scripts/ci-guard-env.mjs";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("CI production-env guard", () => {
  it("accepts localhost Supabase values and placeholder keys", () => {
    expect(
      findProductionEnvViolations({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        DEALATLAS_DB_TEST_URL: "http://localhost:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "ci-placeholder-publishable-key",
        SUPABASE_SECRET_KEY: "ci-placeholder-secret-key",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        DODO_PAYMENTS_ENVIRONMENT: "test_mode",
      }),
    ).toEqual([]);
  });

  it("rejects hosted Supabase URLs", () => {
    const violations = findProductionEnvViolations({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("rejects any non-local Supabase or DB test URL", () => {
    expect(
      findProductionEnvViolations({
        DEALATLAS_DB_TEST_URL: "https://db.example.com",
      }),
    ).toHaveLength(1);
    expect(
      findProductionEnvViolations({ SUPABASE_URL: "not a url" }),
    ).toHaveLength(1);
  });

  it("rejects JWT keys that carry a hosted project ref without echoing them", () => {
    const payload = Buffer.from(
      JSON.stringify({ iss: "supabase", ref: "abcdefghijklmnop", role: "anon" }),
    ).toString("base64url");
    const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
    const violations = findProductionEnvViolations({
      SUPABASE_SECRET_KEY: token,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).not.toContain(token);
  });

  it("allows the local demo JWT (no project ref)", () => {
    const payload = Buffer.from(
      JSON.stringify({ iss: "supabase-demo", role: "anon" }),
    ).toString("base64url");
    expect(
      findProductionEnvViolations({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`,
      }),
    ).toEqual([]);
  });

  it("rejects production app hosts, live billing and production Vercel env", () => {
    expect(
      findProductionEnvViolations({
        NEXT_PUBLIC_APP_URL: "https://www.dealatlas.uk",
      }),
    ).toHaveLength(1);
    expect(
      findProductionEnvViolations({ DODO_PAYMENTS_ENVIRONMENT: "live_mode" }),
    ).toHaveLength(1);
    expect(findProductionEnvViolations({ VERCEL_ENV: "production" })).toHaveLength(
      1,
    );
  });
});

describe("CI workflow", () => {
  const workflow = read(".github/workflows/ci.yml");

  it("runs on pull requests and pushes to main only", () => {
    expect(workflow).toMatch(/^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]/m);
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("workflow_dispatch");
    expect(workflow).not.toContain("pull_request_target");
  });

  it("uses read-only permissions and cancels superseded runs", () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain("cancel-in-progress:");
  });

  it("references no repository secrets", () => {
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\./);
    expect(workflow).not.toMatch(/\$\{\{\s*vars\./);
  });

  it("pins every third-party action to a full commit SHA", () => {
    const uses = [...workflow.matchAll(/^\s*(?:- )?uses:\s*(\S+)/gm)].map(
      (match) => match[1],
    );
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) {
      expect(ref, ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    }
  });

  it("guards the environment in every job", () => {
    const jobs = workflow.split(/^ {2}(?=[a-z0-9-]+:\n {4}name:)/m).slice(1);
    expect(jobs.length).toBeGreaterThanOrEqual(6);
    for (const job of jobs) {
      expect(job.split("\n")[0]).toBeTruthy();
      expect(job).toContain("node scripts/ci-guard-env.mjs");
    }
  });
});
