import { randomUUID } from "node:crypto";

import { expect, test, type APIResponse } from "@playwright/test";

import { requestPublicPreviewRevalidation } from "../../lib/cache/public-preview-remote";
import { E2E_REVALIDATE_SECRET, requireSupabaseEnv } from "./helpers/env";
import { findProtectedMarkerLeaks } from "./helpers/leaks";
import { requireOk, restRequest } from "./helpers/rest";
import { insertDeal, insertPreview, readSeed } from "./helpers/seed";

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

  test("unpublish + job purge stops the cached page", async ({
    request,
    baseURL,
  }) => {
    if (!baseURL) {
      throw new Error("Playwright baseURL is not configured");
    }
    const seed = readSeed();
    const env = requireSupabaseEnv();
    const suffix = randomUUID().slice(0, 8);
    const dealId = randomUUID();
    const slug = `e2e-isr-unpublish-${suffix}`;
    const dealPath = `/deals/${slug}`;

    try {
      await insertDeal(env, {
        id: dealId,
        sourceId: seed.sourceId,
        organizationId: seed.organizationId,
        sourceTitle: `ISR cache fixture ${suffix}`,
        sourceDescription: `Public ISR cache fixture ${suffix}`,
        externalId: `e2e-isr-${suffix}`,
      });
      await insertPreview(env, {
        dealId,
        slug,
        title: `ISR cache fixture ${suffix}`,
        summary:
          "A fresh public opportunity used to verify the ISR cache purge.",
        published: true,
      });

      const purge = await request.post(REVALIDATE, {
        headers: { Authorization: AUTHORIZATION },
        data: { slugs: [slug] },
      });
      expect(purge.status()).toBe(200);

      const first = await request.get(dealPath);
      expect(first.status()).toBe(200);
      const second = await request.get(dealPath);
      expect(second.status()).toBe(200);
      expectCacheHit(second);

      const homeFirst = await request.get("/");
      expect(homeFirst.status()).toBe(200);
      const homeSecond = await request.get("/");
      expect(homeSecond.status()).toBe(200);
      expectCacheHit(homeSecond);
      expect(await homeSecond.text()).toContain(slug);

      await requireOk(
        env,
        env.secretKey,
        `/rest/v1/deal_previews?deal_id=eq.${dealId}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ is_published: false }),
        },
      );

      const revalidated = await requestPublicPreviewRevalidation({
        slugs: [slug],
        env: {
          REVALIDATE_SECRET: E2E_REVALIDATE_SECRET,
          NEXT_PUBLIC_APP_URL: baseURL,
        },
      });
      expect(revalidated).toEqual({ ok: true });

      const goneFirst = await request.get(dealPath);
      expect(goneFirst.status()).toBe(404);
      const goneSecond = await request.get(dealPath);
      expect(goneSecond.status()).toBe(404);

      const homeGone = await request.get("/");
      expect(homeGone.status()).toBe(200);
      expect(await homeGone.text()).not.toContain(slug);
    } finally {
      await restRequest(
        env,
        env.secretKey,
        `/rest/v1/deal_previews?deal_id=eq.${dealId}`,
        { method: "DELETE" },
      );
      await restRequest(env, env.secretKey, `/rest/v1/deals?id=eq.${dealId}`, {
        method: "DELETE",
      });
    }
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
