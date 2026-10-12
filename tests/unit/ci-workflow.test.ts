import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  findEnvFileViolations,
  findProductionEnvViolations,
  LOCAL_DEMO_KEY_SHA256,
} from "@/scripts/ci-guard-env.mjs";

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

// Fake, key-shaped strings only. Built by concatenation so they never look like
// real credentials to secret scanners.
const FAKE_HOSTED_SECRET = "sb_secret_" + "x".repeat(32);
const FAKE_HOSTED_PUBLISHABLE = "sb_publishable_" + "y".repeat(32);

describe("CI production-env guard: key formats", () => {
  it("rejects hosted-format sb_secret_ and sb_publishable_ keys", () => {
    const secret = findProductionEnvViolations({
      SUPABASE_SECRET_KEY: FAKE_HOSTED_SECRET,
    });
    expect(secret).toHaveLength(1);
    expect(secret[0]).toContain("SUPABASE_SECRET_KEY");
    expect(secret[0]).not.toContain(FAKE_HOSTED_SECRET);

    expect(
      findProductionEnvViolations({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_HOSTED_PUBLISHABLE,
        DEALATLAS_DB_TEST_ANON_KEY: FAKE_HOSTED_PUBLISHABLE,
      }),
    ).toHaveLength(2);
  });

  it("allows local demo-style keys (ci-placeholder-* and supabase-demo JWTs)", () => {
    const payload = Buffer.from(
      JSON.stringify({ iss: "supabase-demo", role: "service_role" }),
    ).toString("base64url");
    expect(
      findProductionEnvViolations({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "ci-placeholder-publishable-key",
        SUPABASE_SECRET_KEY: `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`,
      }),
    ).toEqual([]);
  });

  it("recognises the CLI default sb_ keys by digest only", () => {
    expect(LOCAL_DEMO_KEY_SHA256.size).toBe(2);
    for (const digest of LOCAL_DEMO_KEY_SHA256) {
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    }
    // The actual defaults are exercised end to end: the DB and E2E jobs run the
    // guard against the keys `supabase status` reports for the local stack.
  });

  it("rejects unknown Supabase credential formats by default", () => {
    expect(
      findProductionEnvViolations({ SUPABASE_ACCESS_TOKEN: "sbp_" + "z".repeat(40) }),
    ).toHaveLength(1);
  });
});

describe("CI production-env guard: scope", () => {
  it("ignores GitHub-provided ref variables that contain the domain", () => {
    expect(
      findProductionEnvViolations({
        GITHUB_HEAD_REF: "fix/dealatlas.uk-links",
        GITHUB_REF: "refs/heads/fix/dealatlas.uk-links",
        GITHUB_REF_NAME: "dealatlas.uk",
        RUNNER_NAME: "vercel.app-runner",
      }),
    ).toEqual([]);
  });

  it("does not scan unrelated variables for hosted hostnames", () => {
    expect(
      findProductionEnvViolations({ COMMIT_MESSAGE: "update www.dealatlas.uk copy" }),
    ).toEqual([]);
  });
});

describe("CI production-env guard: .env files", () => {
  function withTree(files: Record<string, string>, run: (root: string) => void) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci-guard-"));
    try {
      for (const [name, content] of Object.entries(files)) {
        const file = path.join(root, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
      }
      run(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  it("fails on a .env file with a hosted Supabase URL", () => {
    withTree(
      { ".env.local": "NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co\n" },
      (root) => {
        const violations = findEnvFileViolations(root);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toContain(".env.local");
        expect(violations[0]).toContain("NEXT_PUBLIC_SUPABASE_URL");
      },
    );
  });

  it("fails on hosted keys and quoted values in nested .env files", () => {
    withTree(
      { "apps/web/.env": `export SUPABASE_SECRET_KEY="${FAKE_HOSTED_SECRET}" # prod\n` },
      (root) => {
        const violations = findEnvFileViolations(root);
        expect(violations).toHaveLength(1);
        expect(violations[0]).not.toContain(FAKE_HOSTED_SECRET);
      },
    );
  });

  it("skips .env.example-style templates, node_modules and local-only files", () => {
    withTree(
      {
        ".env.example": "NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co\n",
        ".env.sample": "NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co\n",
        "node_modules/pkg/.env": "NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co\n",
        ".env.test": "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n",
      },
      (root) => {
        expect(findEnvFileViolations(root)).toEqual([]);
      },
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

  it("keys main-push concurrency on the commit SHA so pushes never cancel each other", () => {
    expect(workflow).toContain(
      "group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}",
    );
    expect(workflow).toContain(
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    );
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

  function job(id: string) {
    const start = workflow.indexOf(`\n  ${id}:\n    name:`);
    expect(start, id).toBeGreaterThan(-1);
    const rest = workflow.slice(start + 1);
    const next = rest.slice(1).search(/^ {2}[a-z0-9-]+:\n {4}name:/m);
    return next === -1 ? rest : rest.slice(0, next + 1);
  }

  it("keeps stable names for the jobs listed as required checks", () => {
    for (const name of [
      "name: Lint",
      "name: Typecheck",
      "name: Unit tests",
      "name: Build",
      "name: Database tests (pgTAP + REST)",
      "name: E2E (Playwright)",
      "name: Gate parity (TS/SQL)",
      "name: Leak regression (local)",
      "name: Preview write timing (informational)",
    ]) {
      expect(workflow).toContain(name);
    }
  });

  it("runs npm run test:db (pgTAP + rollback checks) with the psql client installed", () => {
    const database = job("database");
    expect(database).toContain("postgresql-client");
    expect(database.indexOf("postgresql-client")).toBeLessThan(database.indexOf("npm run test:db"));
  });

  it("runs both sides of the gate parity suite", () => {
    const parity = job("gate-parity");
    expect(parity).toContain("git diff --exit-code -- supabase/tests/database/leak_gate_parity.test.sql");
    expect(parity).toContain("npx vitest run tests/unit/leak-gate-parity.test.ts");
    expect(parity).toContain("npx supabase test db --local supabase/tests/database/leak_gate_parity.test.sql");
  });

  it("probes before and after 0019 on the local stack and uploads the report", () => {
    const leak = job("leak-regression");
    const order = [
      "github.event.pull_request.head.sha",
      "LEAK_MERGE_SHA=${{ github.sha }}",
      "mv supabase/migrations/0019_",
      "mv supabase/migrations/0020_",
      "mv supabase/migrations/0021_",
      "npx supabase start",
      "node scripts/ci-guard-env.mjs",
      "npm run build",
      "tests/leak/preflight.ts --baseline",
      "tests/leak/seed/users.ts",
      "tests/leak/run.ts --phase A",
      "npx supabase migration up --local",
      "tests/leak/run.ts --phase B",
      "tests/integration/public-discovery.rest.test.ts",
      "tests/leak/report.ts",
      "actions/upload-artifact",
    ].map((needle) => {
      expect(leak, needle).toContain(needle);
      return leak.indexOf(needle);
    });
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(leak).toContain("if: always()");
    expect(leak).toContain("leak-probes-${LEAK_HEAD_SHA::7}-");
    expect(leak).not.toContain("leak-probes-${GITHUB_SHA::7}-");
  });

  it("keeps the write-timing job informational and artifact-producing", () => {
    const timing = job("write-timing");
    expect(timing).toContain("scripts/preview-write-timing.mjs");
    expect(timing).toContain("actions/upload-artifact");
    expect(timing).not.toContain("continue-on-error");
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
