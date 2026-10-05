type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = { ok: boolean; remaining: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_LOCAL_BUCKETS = 50_000;

/** Per-instance fixed-window limiter. Used directly and as the shared fallback. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_LOCAL_BUCKETS) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) {
          buckets.delete(bucketKey);
        }
      }
      if (buckets.size >= MAX_LOCAL_BUCKETS) {
        buckets.clear();
      }
    }
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { ok: true, remaining: limit - 1, resetAt: next.resetAt };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

type UpstashConfig = { url: string; token: string };

export function upstashConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): UpstashConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return null;
    }
    return { url: parsed.origin, token };
  } catch {
    return null;
  }
}

const UPSTASH_TIMEOUT_MS = 800;

async function upstashFixedWindow(
  config: UpstashConfig,
  key: string,
  limit: number,
  windowMs: number,
  fetchImpl: typeof fetch,
): Promise<RateLimitResult> {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const resetAt = (window + 1) * windowMs;
  const redisKey = `dealatlas:rl:${key}:${window}`;
  const response = await fetchImpl(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["PEXPIRE", redisKey, String(windowMs + 1_000), "NX"],
    ]),
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTASH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Upstash rate limit request failed with ${response.status}`);
  }
  const payload = (await response.json()) as Array<{ result?: unknown; error?: string }>;
  const count = Number(payload?.[0]?.result);
  if (!Number.isFinite(count) || payload?.[0]?.error) {
    throw new Error("Upstash rate limit returned an unexpected payload");
  }
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

/**
 * Fixed-window limiter shared across instances via the Upstash REST API when
 * UPSTASH_REDIS_REST_URL/TOKEN are set. Without them, or when Upstash is slow
 * or unavailable, it degrades to the per-instance limiter.
 */
export async function sharedRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  options: {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<RateLimitResult> {
  const config = upstashConfigFromEnv(options.env);
  if (config) {
    try {
      return await upstashFixedWindow(
        config,
        key,
        limit,
        windowMs,
        options.fetchImpl ?? fetch,
      );
    } catch {
      // Fall through to the per-instance limiter.
    }
  }
  return rateLimit(key, limit, windowMs);
}

export function retryAfterSeconds(result: RateLimitResult, now = Date.now()): number {
  return Math.max(1, Math.ceil((result.resetAt - now) / 1000));
}

export function clientKeyFromRequest(request: Request, prefix: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return `${prefix}:${ip}`;
}

export type PublicRateLimitRule = { bucket: string; limit: number; windowMs: number };

export const PUBLIC_SEARCH_RATE_LIMIT: PublicRateLimitRule = {
  bucket: "public-search",
  limit: 60,
  windowMs: 60_000,
};

/**
 * Anonymous-reachable preview pages throttled in proxy.ts against bulk
 * scraping, per client IP. /api/search is limited in its route handler.
 */
export function publicPageRateLimitRule(pathname: string): PublicRateLimitRule | null {
  if (
    pathname === "/" ||
    pathname === "/deals" ||
    pathname.startsWith("/deals/") ||
    pathname.startsWith("/categories/")
  ) {
    return { bucket: "public-preview-pages", limit: 240, windowMs: 60_000 };
  }
  return null;
}
