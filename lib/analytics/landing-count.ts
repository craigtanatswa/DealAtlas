import { sanitizeUtmValue } from "@/lib/analytics/utm-value";

/**
 * Cookieless landing counts are aggregate only. A path is always one of these
 * route patterns, never the raw pathname, so a deal slug or search query can
 * never be stored.
 */
export const LANDING_PATH_PATTERNS = Object.freeze([
  "/",
  "/deals",
  "/pricing",
  "/how-it-works",
  "/categories",
  "/guides",
  "/contact",
  "/cookies",
  "/privacy",
  "/terms",
  "/checkout",
  "/login",
  "/signup",
  "/alerts/confirmed",
  "/alerts/unsubscribed",
  "/app",
] as const);

const EXACT_PATTERNS = new Set<string>(LANDING_PATH_PATTERNS);

const COLLAPSING_PREFIXES: ReadonlyMap<string, string> = new Map([
  ["deals", "/deals"],
  ["categories", "/categories"],
  ["guides", "/guides"],
  ["checkout", "/checkout"],
  ["app", "/app"],
]);

export function normalizeLandingPath(pathname: string): string | null {
  if (typeof pathname !== "string") {
    return null;
  }
  const cut = pathname.split(/[?#]/, 1)[0] ?? "";
  if (!cut.startsWith("/") || cut.startsWith("//") || cut.includes("\\")) {
    return null;
  }
  const segments = cut.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return "/";
  }
  const joined = `/${segments.join("/")}`;
  if (EXACT_PATTERNS.has(joined)) {
    return joined;
  }
  if (segments.length > 1) {
    return COLLAPSING_PREFIXES.get(segments[0]!) ?? null;
  }
  return null;
}

export type LandingCount = {
  source: string;
  medium: string;
  campaign: string;
  path: string;
};

function isPrefetch(headers: Headers): boolean {
  if (headers.get("rsc") === "1") {
    return true;
  }
  if (headers.get("next-router-prefetch") !== null) {
    return true;
  }
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`;
  return purpose.toLowerCase().includes("prefetch");
}

export function landingCountFromRequest(req: {
  method: string;
  nextUrl: URL;
  headers: Headers;
}): LandingCount | null {
  if (req.method !== "GET") {
    return null;
  }
  if (isPrefetch(req.headers)) {
    return null;
  }
  const campaign = sanitizeUtmValue(req.nextUrl.searchParams.get("utm_campaign"));
  if (campaign === null) {
    return null;
  }
  const path = normalizeLandingPath(req.nextUrl.pathname);
  if (path === null) {
    return null;
  }
  return {
    source: sanitizeUtmValue(req.nextUrl.searchParams.get("utm_source")) ?? "none",
    medium: sanitizeUtmValue(req.nextUrl.searchParams.get("utm_medium")) ?? "none",
    campaign,
    path,
  };
}

type RecordDeps = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

/**
 * Fire-and-forget write to the service-role-only aggregate RPC. Never throws
 * and never logs values, so analytics can never delay or break a response.
 */
export async function recordLandingCount(
  input: LandingCount,
  deps: RecordDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = env.SUPABASE_SECRET_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    return;
  }
  try {
    await (deps.fetchImpl ?? fetch)(
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/record_utm_landing`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_source: input.source,
          p_medium: input.medium,
          p_campaign: input.campaign,
          p_path: input.path,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      },
    );
  } catch {
    // Best effort: a failed analytics write must never surface anywhere.
  }
}
