import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FREE_ENTITLEMENT } from "@/lib/entitlements/policy";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import type { SafeMatchView } from "@/lib/matching/types";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getCurrentEntitlement: vi.fn(),
  getPublicDealPreviewPageBySlug: vi.fn(),
  loadDealSaveState: vi.fn(),
  readFoundingPublicCount: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  sharedRateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getAuthUser: mocks.getAuthUser,
}));
vi.mock("@/lib/entitlements/service", () => ({
  getCurrentEntitlement: mocks.getCurrentEntitlement,
}));
vi.mock("@/lib/search/public", () => ({
  getPublicDealPreviewPageBySlug: mocks.getPublicDealPreviewPageBySlug,
}));
vi.mock("@/lib/saves/queries", () => ({
  loadDealSaveState: mocks.loadDealSaveState,
}));
vi.mock("@/lib/billing/founding-public", () => ({
  readFoundingPublicCount: mocks.readFoundingPublicCount,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...actual, sharedRateLimit: mocks.sharedRateLimit };
});

import * as MeRoute from "@/app/api/me/route";
import * as ViewerRoute from "@/app/api/deals/[id]/viewer/route";

const SLUG = "valid-deal-abc123";
const DEAL_ID = "123e4567-e89b-42d3-a456-426614174000";
const MATCH: SafeMatchView = { score: 88, reasons: [] };
const PRO_ENTITLEMENT: EntitlementSnapshot = {
  ...FREE_ENTITLEMENT,
  plan: "PRO",
  status: "ACTIVE",
  planKey: "pro_monthly",
  billingInterval: "MONTHLY",
  term: "monthly",
};

function request(path = "/api/me"): NextRequest {
  const url = new URL(`http://localhost${path}`);
  const req = new Request(url);
  Object.defineProperty(req, "nextUrl", { value: url });
  return req as unknown as NextRequest;
}

function viewerRequest(slug: string): {
  request: NextRequest;
  context: { params: Promise<{ id: string }> };
} {
  return {
    request: request(`/api/deals/${slug}/viewer`),
    context: { params: Promise.resolve({ id: slug }) },
  };
}

function expectNoStore(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

function signedIn(entitlement: EntitlementSnapshot = FREE_ENTITLEMENT): void {
  mocks.getAuthUser.mockResolvedValue({ id: "user-1" });
  mocks.getCurrentEntitlement.mockResolvedValue(entitlement);
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  delete process.env.DEALATLAS_VIEWER_API_RATE_LIMIT;
  mocks.sharedRateLimit.mockResolvedValue({
    ok: true,
    remaining: 10,
    resetAt: Date.now() + 60_000,
  });
  mocks.createSupabaseServerClient.mockResolvedValue({});
  mocks.loadDealSaveState.mockResolvedValue({ saved: false, used: 0 });
  mocks.readFoundingPublicCount.mockResolvedValue({
    offered: true,
    sold_out: false,
  });
  mocks.getPublicDealPreviewPageBySlug.mockResolvedValue({
    preview: {} as never,
    dealId: DEAL_ID,
    match: MATCH,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/me", () => {
  it("returns only the authenticated flag for an anonymous viewer", async () => {
    mocks.getAuthUser.mockResolvedValue(null);

    const response = await MeRoute.GET(request());

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(await response.json()).toEqual({ authenticated: false });
    expect(mocks.sharedRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("api-me"),
      120,
      60_000,
    );
  });

  it("returns only the authenticated flag for a signed-in viewer", async () => {
    signedIn();

    const response = await MeRoute.GET(request());

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(await response.json()).toEqual({ authenticated: true });
  });

  it("returns 429 with Retry-After and no-store when throttled", async () => {
    mocks.getAuthUser.mockResolvedValue(null);
    mocks.sharedRateLimit.mockResolvedValue({
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const response = await MeRoute.GET(request());

    expect(response.status).toBe(429);
    expectNoStore(response);
    expect(response.headers.get("retry-after")).toBeTruthy();
  });
});

describe("GET /api/deals/[id]/viewer", () => {
  it("returns a 401 error only for anonymous viewers", async () => {
    mocks.getAuthUser.mockResolvedValue(null);
    const { request: req, context } = viewerRequest(SLUG);

    const response = await ViewerRoute.GET(req, context);

    expect(response.status).toBe(401);
    expectNoStore(response);
    expect(await response.json()).toEqual({ error: "Sign in required." });
    expect(mocks.sharedRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("api-deal-viewer"),
      60,
      60_000,
    );
    expect(mocks.getPublicDealPreviewPageBySlug).not.toHaveBeenCalled();
  });

  it("returns free viewer data without Pro match or reveal fields", async () => {
    signedIn();
    const { request: req, context } = viewerRequest(SLUG);

    const response = await ViewerRoute.GET(req, context);

    expect(response.status).toBe(200);
    expectNoStore(response);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.mode).toBe("free");
    expect(Object.keys(body)).not.toContain("match");
    expect(Object.keys(body)).not.toContain("revealHref");
    expect(Object.keys(body)).not.toContain("returnTo");
    expect(body.dealId).toBe(DEAL_ID);
  });

  it("returns Pro reveal links and the match when present", async () => {
    signedIn(PRO_ENTITLEMENT);
    const { request: req, context } = viewerRequest(SLUG);

    const response = await ViewerRoute.GET(req, context);

    expect(response.status).toBe(200);
    expectNoStore(response);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.mode).toBe("pro");
    expect(body.revealHref).toBe(`/app/deals/${DEAL_ID}`);
    expect(body.returnTo).toBe(`/app/deals/${DEAL_ID}`);
    expect(body.match).toEqual(MATCH);
  });

  it("returns 404 for an invalid slug", async () => {
    signedIn();
    const { request: req, context } = viewerRequest("Not A Valid Slug");

    const response = await ViewerRoute.GET(req, context);

    expect(response.status).toBe(404);
    expectNoStore(response);
    expect(await response.json()).toEqual({ error: "Not found." });
  });

  it("returns 404 for an unpublished deal", async () => {
    signedIn();
    mocks.getPublicDealPreviewPageBySlug.mockResolvedValue(null);
    const { request: req, context } = viewerRequest(SLUG);

    const response = await ViewerRoute.GET(req, context);

    expect(response.status).toBe(404);
    expectNoStore(response);
    expect(await response.json()).toEqual({ error: "Not found." });
  });

  it("returns 429 with Retry-After and no-store when throttled", async () => {
    signedIn();
    mocks.sharedRateLimit.mockResolvedValue({
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });
    const { request: req, context } = viewerRequest(SLUG);

    const response = await ViewerRoute.GET(req, context);

    expect(response.status).toBe(429);
    expectNoStore(response);
    expect(response.headers.get("retry-after")).toBeTruthy();
  });
});
