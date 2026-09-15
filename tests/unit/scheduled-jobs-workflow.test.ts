import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("scheduled jobs workflow", () => {
  it("schedules ingestion with manual dispatch and test mode", () => {
    const workflow = read(".github/workflows/scheduled-jobs.yml");
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("npm run job -- --job ingest --due");
    expect(workflow).toContain("mode:");
    expect(workflow).toContain("test");
    expect(workflow).toContain("dry-run");
    expect(workflow).toContain("secrets.SUPABASE_SECRET_KEY");
    expect(workflow).not.toMatch(/re_[A-Za-z0-9]{8,}/);
    expect(workflow).not.toMatch(/service_role/);
    expect(workflow).not.toContain("NEXT_PUBLIC_SUPABASE_SECRET");
  });

  it("keeps alert delivery on a Node script with server-only allowed", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.job).toContain("allow-server-only.mjs");
    expect(pkg.scripts["send-alerts"]).toContain("allow-server-only.mjs");
    expect(read("scripts/send-alerts.ts")).toContain("evaluateAlerts");
    expect(read("scripts/send-alerts.ts")).toContain("sendAlertProviderTest");
    expect(read("scripts/send-alerts.ts")).toContain('args.mode !== "live"');
    expect(read("lib/email/send.ts")).toContain("import \"server-only\"");
    expect(read("lib/email/send.ts")).toContain("RESEND_API_KEY");
  });
});
