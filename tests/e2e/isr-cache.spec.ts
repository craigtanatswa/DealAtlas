import { expect, test, type APIResponse } from "@playwright/test";

import { E2E_REVALIDATE_SECRET } from "./helpers/env";
import { findProtectedMarkerLeaks } from "./helpers/leaks";
import { readSeed } from "./helpers/seed";

const REVALIDATE = "/api/internal/revalidate";
const AUTHORIZATION = `Bearer ${E2E_REVALIDATE_SECRET}`;

function expectCacheHit(response: APIResponse): void {
  const cache = response.headers()["x-nextjs-cache"]?.toUpperCase();
  expect(["HIT", "STALE"]).toContain(cache);
}

async function expectSanitised(response: APIResponse): Promise<void> {
  const body = await response.text();
  expect(findProtectedMarkerLeaks(body)).toEqual([]);
  expect(body).not.toMatch(/\\*"dealId\\*"\s*:/);
  expect(body).not.toContain("/app/deals/");
  expect(body).not.toContain("revealHref");
}

test.describe("ISR public cache", () => {
  test("purged pages serve cached anonymous HTML and RSC without protected markers", async ({
    request,
  }) => {
    const seed = readSeed();

    const purge = await request.post(REVALIDATE, {
      headers: { Authorization: AUTHORIZATION },
      data: {},
    });
    expect(purge.status()).toBe(200);

    for (const path of [`/deals/${seed.publishedSlug}`, "/"]) {
      const first = await request.get(path);
      expect(first.status()).toBe(200);
      await expectSanitised(first);

      const second = await request.get(path);
      expect(second.status()).toBe(200);
      expectCacheHit(second);
      await expectSanitised(second);
    }

    const rsc = await request.get(`/deals/${seed.publishedSlug}`, {
      headers: {
        RSC: "1",
        "Next-Router-State-Tree": encodeURIComponent('["",{},null,null]'),
      },
    });
    expect(rsc.status()).toBe(200);
    await expectSanitised(rsc);
  });

  test("revalidate stays authenticated and the viewer API stays no-store", async ({
    request,
  }) => {
    const wrong = await request.post(REVALIDATE, {
      headers: { Authorization: "Bearer not-the-e2e-secret-0123456789abcdef" },
      data: {},
    });
    expect(wrong.status()).toBe(404);

    const get = await request.get(REVALIDATE);
    expect(get.status()).toBe(405);

    const me = await request.get("/api/me");
    expect(me.status()).toBe(200);
    expect(await me.json()).toEqual({ authenticated: false });
    expect(me.headers()["cache-control"] ?? "").toContain("no-store");
  });
});
