import { describe, expect, it } from "vitest";

import { jobProcessShouldFail, parseJobArgs } from "@/lib/jobs/cli";
import {
  publishAlertText,
  runPublishAlert,
  runPublishEligible,
  runUnpublishStale,
  type PublishJobClient,
} from "@/lib/jobs/publish-open";

function client(opts: {
  count: number;
  rpc?: (fn: string, args?: Record<string, unknown>) => unknown;
  onRpc?: (fn: string, args?: Record<string, unknown>) => void;
}): PublishJobClient {
  return {
    async rpc(fn, args) {
      opts.onRpc?.(fn, args);
      if (!opts.rpc) {
        throw new Error("rpc called");
      }
      return { data: opts.rpc(fn, args), error: null };
    },
    from: () => ({
      select: () => ({
        eq: async () => ({ count: opts.count, error: null }),
      }),
    }),
  };
}

describe("publish jobs", () => {
  it("parses the new job names and keeps dry-run as the default mode", () => {
    expect(parseJobArgs(["--job", "publish-eligible"]).job).toBe("publish-eligible");
    expect(parseJobArgs(["--job", "unpublish-stale"]).mode).toBe("dry-run");
    expect(parseJobArgs(["--job", "publish-alert", "--mode", "live"]).mode).toBe("live");
    expect(jobProcessShouldFail("publish-eligible", "PARTIAL")).toBe(true);
    expect(jobProcessShouldFail("unpublish-stale", "FAILED")).toBe(true);
  });

  it("does not call the write RPCs in dry-run", async () => {
    const seen: string[] = [];
    const result = await runPublishEligible({
      mode: "dry-run",
      client: client({ count: 4, onRpc: (fn) => seen.push(fn) }),
    });
    expect(result.dryRun).toBe(true);
    expect(result.status).toBe("SUCCEEDED");
    expect(seen).toEqual([]);
    const stale = await runUnpublishStale({
      mode: "dry-run",
      client: client({ count: 4, onRpc: (fn) => seen.push(fn) }),
    });
    expect(stale.dryRun).toBe(true);
    expect(seen).toEqual([]);
  });

  it("alerts with counts only when the live published count is under 100", async () => {
    const messages: string[] = [];
    const result = await runPublishEligible({
      mode: "live",
      client: client({
        count: 12,
        rpc: () => ({ selected: 3, published: 1, skipped_cap: 2 }),
      }),
      alert: async (_subject, text) => {
        messages.push(text);
      },
    });
    expect(result.status).toBe("PARTIAL");
    expect(result.publishedLive).toBe(12);
    expect(messages).toEqual([
      publishAlertText({
        job: "publish-eligible",
        status: "PARTIAL",
        publishedLive: 12,
        counts: { selected: 3, published: 1, skipped_cap: 2 },
      }),
    ]);
    expect(messages[0]).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("does not alert when live publish leaves at least 100 rows published", async () => {
    const messages: string[] = [];
    const result = await runPublishEligible({
      mode: "live",
      client: client({
        count: 100,
        rpc: () => ({ selected: 1, published: 1 }),
      }),
      alert: async (_subject, text) => {
        messages.push(text);
      },
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(messages).toEqual([]);
  });

  it("drops non-numeric RPC payloads and alerts failure without them", async () => {
    const messages: string[] = [];
    const result = await runPublishEligible({
      mode: "live",
      client: client({
        count: 4,
        rpc: () => ({ deal_id: "b0000000-0000-4000-8000-000000000001", published: 1 }),
      }),
      alert: async (_subject, text) => {
        messages.push(text);
      },
    });
    expect(result.status).toBe("FAILED");
    expect(result.counts).toEqual({});
    expect(messages[0]).toContain("status=FAILED");
    expect(messages[0]).not.toContain("b0000000");
  });

  it("calls unpublish in live mode and alerts from the backstop under 100", async () => {
    const seen: string[] = [];
    const messages: string[] = [];
    const stale = await runUnpublishStale({
      mode: "live",
      client: client({
        count: 140,
        rpc: (fn) => {
          seen.push(fn);
          return { selected: 2, unpublished: 2 };
        },
        onRpc: () => undefined,
      }),
      alert: async () => {
        throw new Error("unpublish should not alert on success");
      },
    });
    expect(seen).toEqual(["unpublish_stale_previews"]);
    expect(stale.status).toBe("SUCCEEDED");
    const alert = await runPublishAlert({
      mode: "live",
      client: client({ count: 40 }),
      alert: async (_subject, text) => {
        messages.push(text);
      },
    });
    expect(alert.status).toBe("PARTIAL");
    expect(messages[0]).toContain("published_live=40");
    expect(messages[0]).not.toMatch(/[0-9a-f]{8}-/);
  });

  it("sends the live alert through the real email config", async () => {
    const bodies: string[] = [];
    const rpcArgs: Record<string, unknown>[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const result = await runPublishEligible({
      mode: "live",
      client: client({
        count: 12,
        rpc: (_fn, args) => {
          if (args) rpcArgs.push(args);
          return { selected: 3, published: 1, skipped_cap: 2 };
        },
      }),
      env: {
        RESEND_API_KEY: "re_test",
        DEALATLAS_EMAIL_FROM: "alerts@dealatlas.uk",
        LEAK_ALERT_EMAIL_TO: "craig@example.com",
        GITHUB_RUN_ID: "4242",
      },
      fetchImpl,
    });
    expect(result.status).toBe("PARTIAL");
    expect(rpcArgs).toEqual([{ p_cap: 300, p_run_id: "4242" }]);
    const payload = JSON.parse(bodies[0] ?? "{}") as { to?: string; text?: string };
    expect(payload.to).toBe("craig@example.com");
    expect(payload.text).toContain("published=1");
    expect(payload.text).toContain("published_live=12");
    expect(payload.text).toContain("skipped_cap=2");
    expect(payload.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
