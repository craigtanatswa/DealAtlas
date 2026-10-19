import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { INGEST_RATE_LIMIT } from "@/lib/analytics/ingest-proxy";

const TOKEN = "phc_TestKey0123456789abcdef";
const ORIGIN = "http://127.0.0.1:3311";

function ingestRequest(ip: string) {
  const body = JSON.stringify([
    {
      event: "$pageview",
      properties: {
        token: TOKEN,
        distinct_id: "019a0c1e-9a4d-7c8e-8b1f-2d6e5a7c9b10",
        $current_url: `${ORIGIN}/pricing`,
      },
    },
  ]);
  return new NextRequest(`${ORIGIN}/ingest/e`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body,
  });
}

const params = { params: Promise.resolve({ path: ["e"] }) };

describe("/ingest route rate limit", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", TOKEN);
    vi.stubEnv("DEALATLAS_ANALYTICS_UPSTREAM", "off");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("stays a 404 when analytics is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { POST } = await import("@/app/ingest/[...path]/route");
    const response = await POST(ingestRequest("203.0.113.79"), params);
    expect(response.status).toBe(404);
  });
});
