import { describe, expect, it, vi } from "vitest";

import {
  publicPageRateLimitRule,
  retryAfterSeconds,
  sharedRateLimit,
  upstashConfigFromEnv,
} from "@/lib/security/rate-limit";

const UPSTASH_ENV = {
  UPSTASH_REDIS_REST_URL: "https://rate-limit.example.test",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
};

function upstashResponse(count: number) {
  return new Response(JSON.stringify([{ result: count }, { result: 1 }]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("shared rate limit", () => {
  it("uses the per-instance limiter when Upstash is not configured", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const key = `test:unset:${Math.random()}`;
    const first = await sharedRateLimit(key, 2, 60_000, { env: {}, fetchImpl });
    const second = await sharedRateLimit(key, 2, 60_000, { env: {}, fetchImpl });
    const third = await sharedRateLimit(key, 2, 60_000, { env: {}, fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect([first.ok, second.ok, third.ok]).toEqual([true, true, false]);
  });

  it("counts through the Upstash REST pipeline when configured", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(upstashResponse(61));
    const result = await sharedRateLimit("test:upstash", 60, 60_000, {
      env: UPSTASH_ENV,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://rate-limit.example.test/pipeline");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const commands = JSON.parse(String(init?.body)) as string[][];
    expect(commands[0]?.[0]).toBe("INCR");
    expect(commands[0]?.[1]).toMatch(/^dealatlas:rl:test:upstash:\d+$/);
    expect(commands[1]?.slice(0, 1)).toEqual(["PEXPIRE"]);
    expect(commands[1]?.at(-1)).toBe("NX");
  });

  it("falls back to the per-instance limiter when Upstash fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));
    const key = `test:failing:${Math.random()}`;
    const first = await sharedRateLimit(key, 1, 60_000, { env: UPSTASH_ENV, fetchImpl });
    const second = await sharedRateLimit(key, 1, 60_000, { env: UPSTASH_ENV, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect([first.ok, second.ok]).toEqual([true, false]);
  });

  it("ignores incomplete or non-https Upstash configuration", () => {
    expect(upstashConfigFromEnv({ UPSTASH_REDIS_REST_URL: UPSTASH_ENV.UPSTASH_REDIS_REST_URL })).toBeNull();
    expect(
      upstashConfigFromEnv({ ...UPSTASH_ENV, UPSTASH_REDIS_REST_URL: "http://plain.example.test" }),
    ).toBeNull();
    expect(upstashConfigFromEnv(UPSTASH_ENV)).toEqual({
      url: "https://rate-limit.example.test",
      token: "test-token",
    });
  });

  it("computes a positive Retry-After", () => {
    expect(retryAfterSeconds({ ok: false, remaining: 0, resetAt: 10_500 }, 10_000)).toBe(1);
    expect(retryAfterSeconds({ ok: false, remaining: 0, resetAt: 40_000 }, 10_000)).toBe(30);
  });
});

describe("public page rate limit rules", () => {
  it("throttles anonymous preview pages only", () => {
    for (const pathname of ["/", "/deals", "/deals/sample-preview-1a2b3c4d", "/categories/it"]) {
      expect(publicPageRateLimitRule(pathname)?.bucket, pathname).toBe("public-preview-pages");
    }
    for (const pathname of ["/api/search", "/api/billing/webhook", "/app", "/login", "/pricing"]) {
      expect(publicPageRateLimitRule(pathname), pathname).toBeNull();
    }
  });
});
