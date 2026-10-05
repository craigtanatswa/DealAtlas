/**
 * HTTP client for leak probes (spec section 1.5).
 *
 * - `Accept-Encoding: identity`; redirects are never followed automatically,
 *   every hop is recorded and scanned.
 * - A 429 is never a pass: Retry-After is honoured up to 3 times, then the
 *   response is returned as-is and the probe fails.
 * - No `x-forwarded-for` rotation (OQ-17). Requests are paced per
 *   rate-limit bucket instead. The app keys its limiter on the first
 *   `x-forwarded-for` value (lib/security/rate-limit.ts clientKeyFromRequest),
 *   and the fixed windows are 240/min for preview pages and 60/min for
 *   /api/search; a sliding window below those caps can never trip them.
 */

export type HttpHop = {
  url: string;
  method: string;
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
  contentType: string;
};

export type HttpResult = {
  hops: HttpHop[];
  final: HttpHop;
  retries: number;
  rateLimited: boolean;
  durationMs: number;
  startedAt: string;
};

export type HttpRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  followRedirects?: boolean;
};

const PACE: Record<string, { limit: number; windowMs: number }> = {
  preview: { limit: 220, windowMs: 61_000 },
  search: { limit: 55, windowMs: 61_000 },
};

class SlidingWindow {
  private stamps: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  acquire(): Promise<void> {
    const next = this.queue.then(async () => {
      for (;;) {
        const now = Date.now();
        while (this.stamps.length && now - this.stamps[0] >= this.windowMs) this.stamps.shift();
        if (this.stamps.length < this.limit) {
          this.stamps.push(now);
          return;
        }
        await sleep(this.windowMs - (now - this.stamps[0]) + 5);
      }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** After a 429 the server window is full: wait it out before anything else. */
  penalise(ms: number): void {
    const until = Date.now() + ms;
    this.queue = this.queue.then(() => sleep(Math.max(0, until - Date.now())));
  }
}

const windows = new Map<string, SlidingWindow>();

export function bucketFor(method: string, url: string, appOrigin: string): string | null {
  const parsed = new URL(url);
  if (parsed.origin !== appOrigin) return null;
  const p = parsed.pathname;
  if (p === "/api/search") return "search";
  if (method !== "GET") return null;
  if (p === "/" || p === "/deals" || p.startsWith("/deals/") || p.startsWith("/categories/")) return "preview";
  return null;
}

function windowFor(bucket: string | null): SlidingWindow | null {
  if (!bucket) return null;
  let w = windows.get(bucket);
  if (!w) {
    const pace = PACE[bucket];
    w = new SlidingWindow(pace.limit, pace.windowMs);
    windows.set(bucket, w);
  }
  return w;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeBody(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return Buffer.from(buffer).toString("latin1");
  }
}

let appOrigin = "";
export function setAppOrigin(origin: string): void {
  appOrigin = new URL(origin).origin;
}

/** Browser requests share the pacing windows with the HTTP client. */
export async function reserve(method: string, url: string): Promise<void> {
  await windowFor(bucketFor(method, url, appOrigin))?.acquire();
}

async function once(method: string, url: string, headers: Record<string, string>, body?: string) {
  const window = windowFor(bucketFor(method, url, appOrigin));
  let retries = 0;
  for (;;) {
    await window?.acquire();
    const response = await fetch(url, {
      method,
      headers: { "accept-encoding": "identity", ...headers },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    const text = decodeBody(await response.arrayBuffer());
    const hop: HttpHop = {
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      body: text,
      contentType: response.headers.get("content-type") ?? "",
    };
    if (response.status === 429 && retries < 3) {
      retries += 1;
      const after = Number(response.headers.get("retry-after") ?? "5");
      const waitMs = (Number.isFinite(after) && after > 0 ? after : 5) * 1000 + 250;
      window?.penalise(waitMs);
      await sleep(waitMs);
      continue;
    }
    return { hop, retries };
  }
}

export async function send(request: HttpRequest): Promise<HttpResult> {
  const started = Date.now();
  const hops: HttpHop[] = [];
  let retries = 0;
  let url = request.url;
  let method = request.method;
  let body = request.body;
  for (let hopIndex = 0; hopIndex < 6; hopIndex += 1) {
    const result = await once(method, url, request.headers ?? {}, body);
    retries += result.retries;
    hops.push(result.hop);
    const location = result.hop.headers.find(([name]) => name === "location")?.[1];
    if (request.followRedirects === false || !location || result.hop.status < 300 || result.hop.status >= 400) break;
    const next = new URL(location, url);
    if (next.hostname !== "127.0.0.1" && next.hostname !== "localhost") break;
    url = next.toString();
    if (result.hop.status === 303 || ((result.hop.status === 301 || result.hop.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
    }
  }
  const final = hops[hops.length - 1];
  return {
    hops,
    final,
    retries,
    rateLimited: final.status === 429,
    durationMs: Date.now() - started,
    startedAt: new Date(started).toISOString(),
  };
}

/** Everything a client receives: status lines, every header and every body, per hop. */
export function responseText(result: HttpResult): string {
  return result.hops
    .map((hop) => `HTTP ${hop.status} ${hop.statusText}\n${headerText(hop)}\n\n${hop.body}`)
    .join("\n\n");
}

export function headerText(hop: HttpHop): string {
  return hop.headers.map(([name, value]) => `${name}: ${value}`).join("\n");
}

export function header(hop: HttpHop, name: string): string | null {
  return hop.headers.find(([key]) => key === name.toLowerCase())?.[1] ?? null;
}

export function parseJson(hop: HttpHop): unknown {
  try {
    return JSON.parse(hop.body);
  } catch {
    return undefined;
  }
}
