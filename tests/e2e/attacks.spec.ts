import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { findProtectedMarkerLeaks } from "../helpers/protected-leak";
import { loginAs } from "./helpers/auth";
import { requireSupabaseEnv } from "./helpers/env";
import { restRequest } from "./helpers/rest";
import { readSeed } from "./helpers/seed";

test.describe("Attack tests", () => {
  test("canonical tables stay closed to anon and free clients", async () => {
    const env = requireSupabaseEnv();
    const tables = [
      "deals",
      "organizations",
      "notices",
      "documents",
      "data_sources",
      "lots",
      "contracts",
      "alerts",
      "subscriptions",
    ];
    for (const table of tables) {
      const result = await restRequest(
        env,
        env.anonKey,
        `/rest/v1/${table}?select=*&limit=1`,
      );
      expect(result.status, table).toBeGreaterThanOrEqual(400);
      expect(findProtectedMarkerLeaks(result.text), table).toEqual([]);
    }

    const graphql = await restRequest(env, env.anonKey, "/graphql/v1", {
      method: "POST",
      body: JSON.stringify({
        query: "{ dealsCollection { edges { node { source_title } } } }",
      }),
    });
    expect(findProtectedMarkerLeaks(graphql.text)).toEqual([]);
  });

  test("paid APIs reject anonymous, free, tampered IDs, and guessed deals", async ({
    browser,
    request,
  }) => {
    const seed = readSeed();
    const guessed = randomUUID();

    const anonDeal = await request.get(`/api/deals/${seed.publishedDealId}`);
    expect(anonDeal.status()).toBe(401);
    expect(findProtectedMarkerLeaks(await anonDeal.text())).toEqual([]);

    const anonBuyers = await request.get("/api/buyers");
    expect(anonBuyers.status()).toBeGreaterThanOrEqual(401);
    expect(findProtectedMarkerLeaks(await anonBuyers.text())).toEqual([]);

    const anonExport = await request.post("/api/exports", {
      data: { dealIds: [seed.publishedDealId] },
    });
    expect(anonExport.status()).toBe(401);

    const freeContext = await browser.newContext();
    const freePage = await freeContext.newPage();
    await loginAs(freePage, seed.free);

    const freeDeal = await freePage.request.get(`/api/deals/${seed.publishedDealId}`);
    expect(freeDeal.status()).toBe(403);
    expect(findProtectedMarkerLeaks(await freeDeal.text())).toEqual([]);

    const guessedFree = await freePage.request.get(`/api/deals/${guessed}`);
    expect(guessedFree.status()).toBe(403);

    const tamperedCheckout = await freePage.request.post("/api/billing/checkout", {
      headers: { Accept: "application/json", "content-type": "application/json" },
      data: {
        planKey: "PRO_MONTHLY",
        product_id: "pdt_attacker",
        user_id: seed.admin.id,
        metadata: { user_id: seed.admin.id, plan: "PRO" },
      },
    });
    expect(tamperedCheckout.status()).toBe(400);

    await freePage.goto(
      `/checkout/success?success=true&plan=PRO&session_id=sess_fake&user_id=${seed.admin.id}`,
    );
    const stillForbidden = await freePage.request.get(
      `/api/deals/${seed.publishedDealId}`,
    );
    expect(stillForbidden.status()).toBe(403);

    const env = requireSupabaseEnv();
    const session = await restRequest(env, env.anonKey, "/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({
        email: seed.free.email,
        password: seed.free.password,
      }),
    });
    const accessToken =
      session.body &&
      typeof session.body === "object" &&
      !Array.isArray(session.body)
        ? (session.body as { access_token?: string }).access_token
        : undefined;
    expect(accessToken).toBeTruthy();

    const rolePatch = await restRequest(
      env,
      env.anonKey,
      `/rest/v1/profiles?id=eq.${seed.free.id}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ role: "ADMIN" }),
      },
    );
    expect(rolePatch.status).toBeGreaterThanOrEqual(400);

    const roleRead = await restRequest(
      env,
      env.anonKey,
      `/rest/v1/profiles?id=eq.${seed.free.id}&select=role`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    expect(roleRead.status).toBe(200);
    expect(roleRead.body).toEqual([{ role: "USER" }]);

    await freeContext.close();
  });

  test("public SEO metadata stays on preview fields", async ({ request }) => {
    const seed = readSeed();
    const home = await request.get("/");
    const homeHtml = await home.text();
    expect(findProtectedMarkerLeaks(homeHtml)).toEqual([]);
    expect(homeHtml).toMatch(/<title>/i);

    const preview = await request.get(`/deals/${seed.publishedSlug}`);
    const previewHtml = await preview.text();
    expect(findProtectedMarkerLeaks(previewHtml)).toEqual([]);
    expect(previewHtml).toContain(seed.previewTitle);
    expect(previewHtml.toLowerCase()).toContain("application/ld+json");
  });
});
