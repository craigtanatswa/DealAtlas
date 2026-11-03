import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { INGEST_RATE_LIMIT } from "@/lib/analytics/ingest-proxy";

const TOKEN = "phc_TestKey0123456789abcdef";
const ORIGIN = "http://localhost:3311";

function ingestRequestFor(ip: string, event: unknown) {
  const body = JSON.stringify([event]);
  return new NextRequest(`${ORIGIN}/ingest/e`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body,
  });
}

function ingestRequest(ip: string) {
  return ingestRequestFor(ip, {
    event: "$pageview",
    properties: {
      token: TOKEN,
      distinct_id: "019a0c1e-9a4d-7c8e-8b1f-2d6e5a7c9b10",
      $current_url: `${ORIGIN}/pricing`,
    },
  });
}

function guideCtaViewedEvent(properties: Record<string, unknown>) {
  return {
    event: "guide_cta_viewed",
    properties: {
      token: TOKEN,
      distinct_id: "019a0c1e-9a4d-7c8e-8b1f-2d6e5a7c9b10",
      $current_url: `${ORIGIN}/guides/how-to-win-council-contracts`,
      guide_slug: "how-to-win-council-contracts",
      position: "after_answer",
      target: "signup",
      ...properties,
    },
  };
}

const params = { params: Promise.resolve({ path: ["e"] }) };

describe("/ingest route rate limit", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", TOKEN);
    vi.stubEnv("DEALATLAS_ANALYTICS_UPSTREAM", "off");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns 429 with Retry-After once one IP exceeds the per-minute cap", async () => {
    const { POST } = await import("@/app/ingest/[...path]/route");
    const ip = "203.0.113.77";
    for (let i = 0; i < INGEST_RATE_LIMIT.limit; i += 1) {
      const response = await POST(ingestRequest(ip), params);
      expect(response.status).toBe(200);
    }
    const blocked = await POST(ingestRequest(ip), params);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    // Other clients are unaffected.
    const other = await POST(ingestRequest("203.0.113.78"), params);
    expect(other.status).toBe(200);
  });

  it("forwards only allowlisted guide_cta_viewed properties and drops the rest", async () => {
    vi.stubEnv("DEALATLAS_ANALYTICS_UPSTREAM", "upstream");
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const { POST } = await import("@/app/ingest/[...path]/route");

    const valid = guideCtaViewedEvent({
      buyer_name: "CANARY BUYER NEVER FREE",
      deal_url: `${ORIGIN}/deals/canary-deal-a1b2c3?notice=NTC-998877`,
      deal_id: "3f2b7c1e-9a4d-4c8e-8b1f-2d6e5a7c9b10",
    });
    const response = await POST(ingestRequestFor("203.0.113.80", valid), params);
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://eu.i.posthog.com/batch/");
    const body = JSON.parse(String(init.body)) as {
      batch: Array<{ event: string; properties: Record<string, unknown> }>;
    };
    expect(body.batch).toHaveLength(1);
    expect(body.batch[0]!.event).toBe("guide_cta_viewed");
    expect(body.batch[0]!.properties).toMatchObject({
      guide_slug: "how-to-win-council-contracts",
      position: "after_answer",
      target: "signup",
    });
    const serialised = JSON.stringify(body).toLowerCase();
    for (const forbidden of [
      "canary",
      "ntc-998877",
      "buyer_name",
      "deal_url",
      "deal_id",
      "/deals/",
      "?notice",
    ]) {
      expect(serialised).not.toContain(forbidden);
    }

    fetchImpl.mockClear();
    const invalid = guideCtaViewedEvent({ position: "canary-position" });
    const rejected = await POST(ingestRequestFor("203.0.113.81", invalid), params);
    expect(rejected.status).toBe(200);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stays a 404 when analytics is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { POST } = await import("@/app/ingest/[...path]/route");
    const response = await POST(ingestRequest("203.0.113.79"), params);
    expect(response.status).toBe(404);
  });
});
