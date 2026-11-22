import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  sharedRateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return {
    ...actual,
    sharedRateLimit: mocks.sharedRateLimit,
  };
});

import * as route from "@/app/api/internal/revalidate/route";

const SECRET = "s".repeat(32);
const originalSecret = process.env.REVALIDATE_SECRET;

function request(
  body: unknown,
  token: string | null = SECRET,
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new Request("http://localhost/api/internal/revalidate", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function expectNoStore(response: Response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  expect(cacheControl).toContain("no-store");
  expect(cacheControl).not.toContain("public");
  expect(cacheControl).not.toContain("s-maxage");
}

beforeEach(() => {
  mocks.revalidatePath.mockReset();
  mocks.revalidateTag.mockReset();
  mocks.sharedRateLimit.mockReset();
  mocks.sharedRateLimit.mockResolvedValue({
    ok: true,
    remaining: 29,
    resetAt: Date.now() + 60_000,
  });
  delete process.env.REVALIDATE_SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.REVALIDATE_SECRET;
  } else {
    process.env.REVALIDATE_SECRET = originalSecret;
  }
  vi.restoreAllMocks();
});

describe("internal revalidate route", () => {
  it("returns 404 when no secret is configured", async () => {
    const response = await route.POST(request({ slugs: ["valid-deal"] }));

    expect(response.status).toBe(404);
    expectNoStore(response);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("returns 404 for a short secret", async () => {
    process.env.REVALIDATE_SECRET = "too-short";
    const response = await route.POST(
      request({ slugs: ["valid-deal"] }, "too-short"),
    );

    expect(response.status).toBe(404);
    expectNoStore(response);
  });

  it("returns 404 for a wrong bearer token", async () => {
    process.env.REVALIDATE_SECRET = SECRET;
    const response = await route.POST(
      request({ slugs: ["valid-deal"] }, "t".repeat(32)),
    );

    expect(response.status).toBe(404);
    expectNoStore(response);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not export GET", () => {
    expect("GET" in route).toBe(false);
  });

  it("rejects an invalid slug", async () => {
    process.env.REVALIDATE_SECRET = SECRET;
    const response = await route.POST(
      request({ slugs: ["Not A Valid Slug"] }),
    );

    expect(response.status).toBe(400);
    expectNoStore(response);
    expect(await response.json()).toEqual({ error: "Invalid slug." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates the home page, deal page, and tags for a valid slug", async () => {
    process.env.REVALIDATE_SECRET = SECRET;
    const response = await route.POST(
      request({ slugs: ["valid-deal-abc123"] }),
    );

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(await response.json()).toEqual({ ok: true, revalidated: 1 });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/deals/valid-deal-abc123",
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      "public-preview",
      { expire: 0 },
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      "public-preview:valid-deal-abc123",
      { expire: 0 },
    );
    expect(mocks.sharedRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("internal-revalidate"),
      30,
      60_000,
    );
  });

  it("returns 429 with Retry-After when the rate limit is hit", async () => {
    process.env.REVALIDATE_SECRET = SECRET;
    mocks.sharedRateLimit.mockResolvedValue({
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const response = await route.POST(request({ slugs: [] }));

    expect(response.status).toBe(429);
    expectNoStore(response);
    expect(response.headers.get("retry-after")).toBeTruthy();
  });

  it("never logs the bearer token", async () => {
    process.env.REVALIDATE_SECRET = SECRET;
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
    ];

    await route.POST(request({ slugs: ["valid-deal"] }, "t".repeat(32)));
    await route.POST(request({ slugs: ["valid-deal"] }));

    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(SECRET);
      }
    }
  });
});
