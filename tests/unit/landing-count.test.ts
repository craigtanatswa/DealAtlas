import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { NextFetchEvent } from "next/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/update-session", () => ({
  updateSession: vi.fn(async () => new Response("ok", { status: 200 })),
}));

import {
  LANDING_PATH_PATTERNS,
  landingCountFromRequest,
  normalizeLandingPath,
  recordLandingCount,
} from "@/lib/analytics/landing-count";
import { sanitizeUtmValue } from "@/lib/analytics/utm-value";
import { proxy } from "@/proxy";

const ROOT = path.resolve(__dirname, "../..");
const APP_DIR = path.join(ROOT, "app");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function appPageRoutes(): string[] {
  return walk(APP_DIR)
    .filter((file) => path.basename(file) === "page.tsx")
    .map((file) => {
      const relative = path.relative(APP_DIR, file).split(path.sep).join("/");
      const withoutPage = relative.replace(/\/?page\.tsx$/, "");
      const segments = withoutPage
        .split("/")
        .filter(Boolean)
        .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
      return `/${segments.join("/")}`;
    })
    .sort();
}

const EXACT_PATTERNS = new Set<string>(LANDING_PATH_PATTERNS);
const COLLAPSING_PREFIXES = new Set(["deals", "categories", "guides", "checkout", "app"]);

function expectedLandingPath(route: string): string | null {
  const segments = route.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "/";
  }
  if (segments.length > 1 && COLLAPSING_PREFIXES.has(segments[0]!)) {
    return `/${segments[0]}`;
  }
  const joined = `/${segments.join("/")}`;
  return EXACT_PATTERNS.has(joined) ? joined : null;
}

function request(
  pathname: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    search?: string;
  } = {},
) {
  return {
    method: options.method ?? "GET",
    nextUrl: new URL(`https://www.dealatlas.example${pathname}${options.search ?? ""}`),
    headers: new Headers(options.headers ?? {}),
  };
}

const TRACKED_SEARCH = "?utm_campaign=Spring&utm_source=Outreach&utm_medium=Email";

describe("sanitizeUtmValue", () => {
  it.each([
    ["Spring_Sale", "spring_sale"],
    ["  spring-2026  ", "spring-2026"],
    ["a".repeat(64), "a".repeat(64)],
    ["a".repeat(65), "other"],
    ["spring sale", "other"],
    ["spring.sale", "other"],
    ["café", "other"],
    ["", null],
    ["   ", null],
    [null, null],
    [undefined, null],
    [42, null],
  ])("%s → %s", (input, expected) => {
    expect(sanitizeUtmValue(input)).toBe(expected);
  });
});

describe("normalizeLandingPath", () => {
  it("maps every app page route to an allowlisted pattern or null", () => {
    const routes = appPageRoutes();
    expect(routes.length).toBeGreaterThan(30);
    expect(routes).toContain("/");
    expect(routes).toContain("/deals/[slug]");

    for (const route of routes) {
      const expected = expectedLandingPath(route);
      const actual = normalizeLandingPath(route);
      expect(actual, route).toBe(expected);
      if (actual !== null) {
        expect(LANDING_PATH_PATTERNS as readonly string[], route).toContain(actual);
      }
    }
  });

  it("collapses dynamic segments and tolerates trailing slashes", () => {
    expect(normalizeLandingPath("/deals/some-slug-123")).toBe("/deals");
    expect(normalizeLandingPath("/deals/some-slug-123/extra")).toBe("/deals");
    expect(normalizeLandingPath("/categories/it")).toBe("/categories");
    expect(normalizeLandingPath("/guides/how-to-win")).toBe("/guides");
    expect(normalizeLandingPath("/checkout/success")).toBe("/checkout");
    expect(normalizeLandingPath("/checkout/lifetime-full")).toBe("/checkout");
    expect(normalizeLandingPath("/app")).toBe("/app");
    expect(normalizeLandingPath("/app/saved/123")).toBe("/app");
    expect(normalizeLandingPath("/pricing/")).toBe("/pricing");
    expect(normalizeLandingPath("/")).toBe("/");
  });

  it("rejects admin, api, unknown and malformed paths", () => {
    for (const pathname of [
      "/admin",
      "/admin/deals/123",
      "/api/search",
      "/_next/static/chunk.js",
      "/unknown",
      "/pricing/extra",
      "/forgot-password",
      "/design-system",
      "//evil.example/deals",
      "deals/x",
      "/deals\\admin",
    ]) {
      expect(normalizeLandingPath(pathname), pathname).toBeNull();
    }
    expect(normalizeLandingPath(undefined as unknown as string)).toBeNull();
  });

  it("never returns a segment outside the allowlist", () => {
    const outputs = appPageRoutes()
      .map(normalizeLandingPath)
      .filter((value): value is string => value !== null);
    for (const output of outputs) {
      expect(LANDING_PATH_PATTERNS as readonly string[]).toContain(output);
    }
  });
});

describe("landingCountFromRequest", () => {
  it("returns sanitized aggregate values for a tracked GET", () => {
    expect(landingCountFromRequest(request("/pricing", { search: TRACKED_SEARCH }))).toEqual({
      source: "outreach",
      medium: "email",
      campaign: "spring",
      path: "/pricing",
    });
  });

  it("collapses raw paths and uses none for missing source or medium", () => {
    expect(
      landingCountFromRequest(
        request("/deals/council-it-support-a1b2c3", {
          search: "?utm_campaign=launch",
        }),
      ),
    ).toEqual({
      source: "none",
      medium: "none",
      campaign: "launch",
      path: "/deals",
    });
    expect(
      landingCountFromRequest(
        request("/pricing", {
          search: "?utm_campaign=launch&utm_source=bad%20source&utm_medium=toolong".concat(
            "a".repeat(60),
          ),
        }),
      ),
    ).toEqual({
      source: "other",
      medium: "other",
      campaign: "launch",
      path: "/pricing",
    });
  });

  it("skips non-GET, missing campaign and non-allowlisted paths", () => {
    expect(
      landingCountFromRequest(request("/pricing", { method: "POST", search: TRACKED_SEARCH })),
    ).toBeNull();
    expect(landingCountFromRequest(request("/pricing"))).toBeNull();
    expect(landingCountFromRequest(request("/pricing", { search: "?utm_campaign=" }))).toBeNull();
    expect(
      landingCountFromRequest(request("/admin", { search: TRACKED_SEARCH })),
    ).toBeNull();
  });

  it("skips RSC and prefetch requests", () => {
    const prefetchHeaders: Array<Record<string, string>> = [
      { rsc: "1" },
      { "next-router-prefetch": "" },
      { purpose: "prefetch" },
      { "sec-purpose": "prefetch;prerender" },
    ];
    for (const headers of prefetchHeaders) {
      expect(
        landingCountFromRequest(request("/pricing", { headers, search: TRACKED_SEARCH })),
      ).toBeNull();
    }
  });
});

describe("recordLandingCount privacy", () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "service-key",
  };

  it("never sends slugs, IPs, user agents or cookies", async () => {
    for (let i = 0; i < 500; i += 1) {
      const slugId = randomUUID();
      const ipId = randomUUID();
      const uaId = randomUUID();
      const cookieId = randomUUID();
      const slug = `deals/council-it-support-${slugId}/private?ref=${slugId}`;
      const ip = `10.${i % 256}.${i % 251}.${i % 249}-${ipId}`;
      const userAgent = `Mozilla/5.0 (${uaId}) AppleWebKit/537.36-${uaId}`;
      const cookie = `session=${cookieId}; analytics=${cookieId}`;

      const target = new URL(
        `https://www.dealatlas.example/deals/${encodeURIComponent(slug)}`,
      );
      target.searchParams.set("utm_source", ip);
      target.searchParams.set("utm_medium", userAgent);
      target.searchParams.set("utm_campaign", cookie);

      const count = landingCountFromRequest({
        method: "GET",
        nextUrl: target,
        headers: new Headers({
          "x-forwarded-for": ip,
          "user-agent": userAgent,
          cookie,
        }),
      });
      expect(count, `iteration ${i}`).not.toBeNull();

      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 204 }));
      await recordLandingCount(count!, { env, fetchImpl });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0]!;
      expect(url).toBe("https://supabase.example.test/rest/v1/rpc/record_utm_landing");

      const headers = init?.headers as Record<string, string>;
      expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain("cookie");

      const body = String(init?.body);
      expect(body).not.toContain(slug);
      expect(body).not.toContain(ip);
      expect(body).not.toContain(userAgent);
      expect(body).not.toContain(cookie);

      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual([
        "p_campaign",
        "p_medium",
        "p_path",
        "p_source",
      ]);
      expect(parsed).toEqual({
        p_source: "other",
        p_medium: "other",
        p_campaign: "other",
        p_path: "/deals",
      });
    }
  });

  it("never throws when the write fails or env is missing", async () => {
    const count = {
      source: "outreach",
      medium: "email",
      campaign: "spring",
      path: "/pricing",
    };
    await expect(
      recordLandingCount(count, {
        env,
        fetchImpl: vi.fn(async () => {
          throw new Error("network down");
        }),
      }),
    ).resolves.toBeUndefined();
    await expect(recordLandingCount(count, { env: {} })).resolves.toBeUndefined();
    await expect(
      recordLandingCount(count, { env: { SUPABASE_SECRET_KEY: "only-key" } }),
    ).resolves.toBeUndefined();
    await expect(
      recordLandingCount(count, { env: { NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL } }),
    ).resolves.toBeUndefined();
  });
});

describe("proxy landing count", () => {
  const trackedUrl =
    "https://www.dealatlas.example/pricing?utm_campaign=spring&utm_source=outreach&utm_medium=email";

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("queues the write with waitUntil without awaiting it", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SECRET_KEY", "service-key");
    let resolveFetch: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetchMock);

    const waitUntil = vi.fn();
    const response = await proxy(new NextRequest(trackedUrl), {
      waitUntil,
    } as unknown as NextFetchEvent);

    expect(response.status).toBe(200);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    const write = waitUntil.mock.calls[0]![0] as Promise<void>;
    expect(write).toBeInstanceOf(Promise);

    resolveFetch!(new Response(null, { status: 204 }));
    await write;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the normal response even when the write rejects", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SECRET_KEY", "service-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const waitUntil = vi.fn();
    const response = await proxy(new NextRequest(trackedUrl), {
      waitUntil,
    } as unknown as NextFetchEvent);

    expect(response.status).toBe(200);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await expect(waitUntil.mock.calls[0]![0]).resolves.toBeUndefined();
  });
});
