import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { findProtectedMarkerLeaks } from "./helpers/leaks";
import { readSeed } from "./helpers/seed";
import {
  proActiveWebhookPayload,
  signedWebhookHeaders,
} from "./helpers/webhook";

test.describe("Pro journey", () => {
  test("Webhook fixture → exact Deal → source/apply → buyer intelligence → save/search/alert → export → billing portal", async ({
    page,
    request,
  }) => {
    const seed = readSeed();
    const subscriptionId = `sub_e2e_${seed.suffix}`;
    const customerId = `cus_e2e_${seed.suffix}`;
    const payload = proActiveWebhookPayload({
      userId: seed.pro.id,
      email: seed.pro.email,
      subscriptionId,
      customerId,
    });
    const body = JSON.stringify(payload);
    const webhookId = `evt_e2e_${seed.suffix}`;

    const forged = await request.post("/api/webhooks/dodo", {
      headers: {
        "content-type": "application/json",
        "webhook-id": "evt_forged",
        "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
        "webhook-signature": "v1,forged",
      },
      data: body,
    });
    expect(forged.status()).toBeGreaterThanOrEqual(400);

    const applied = await request.post("/api/webhooks/dodo", {
      headers: signedWebhookHeaders(body, webhookId),
      data: body,
    });
    expect(applied.ok()).toBeTruthy();

    const duplicate = await request.post("/api/webhooks/dodo", {
      headers: signedWebhookHeaders(body, webhookId),
      data: body,
    });
    expect(duplicate.ok()).toBeTruthy();

    await loginAs(page, seed.pro);

    const success = await page.request.get("/api/deals/" + seed.publishedDealId);
    expect(success.status()).toBe(200);
    const paidJson = await success.text();
    expect(findProtectedMarkerLeaks(paidJson).length).toBeGreaterThan(0);

    await page.goto(`/app/deals/${seed.publishedDealId}`);
    await expect(
      page.getByRole("heading", { name: /CANARY SOURCE TITLE NEVER FREE/i }),
    ).toBeVisible();
    await expect(page.getByText("CANARY BUYER NEVER FREE").first()).toBeVisible();
    const sourceLink = page.getByRole("link", { name: /Open source notice/i });
    await expect(sourceLink).toBeVisible();
    expect(await sourceLink.getAttribute("href")).toBe(
      "https://canary-source.example/notice",
    );
    const applyLink = page.getByRole("link", { name: /Open application/i });
    await expect(applyLink).toBeVisible();
    expect(await applyLink.getAttribute("href")).toBe(
      "https://canary-source.example/apply",
    );

    await page.goto(`/app/deals/${seed.xssDealId}`);
    const xssHtml = await page.content();
    expect(xssHtml).not.toMatch(/<script>alert/i);
    expect(xssHtml).not.toMatch(/<img [^>]*onerror=/i);

    await page.goto("/app/buyers");
    await expect(page.getByRole("heading", { name: "Buyers" })).toBeVisible();
    await expect(page.getByText("CANARY BUYER NEVER FREE").first()).toBeVisible();

    await page.goto("/app/search");
    await page.locator("#search-q").fill(seed.searchToken);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: seed.previewTitle })).toBeVisible();
    await page.getByLabel("Save this search").fill(`Pro ${seed.searchToken}`);
    await page.getByRole("button", { name: "Save search" }).click();
    await expect(page.getByRole("status")).toContainText("Search saved", {
      timeout: 20_000,
    });

    await page.goto(`/app/deals/${seed.publishedDealId}`);
    const saveButton = page.getByRole("button", { name: /Save opportunity|Unsave/ });
    if ((await saveButton.textContent())?.includes("Save opportunity")) {
      await saveButton.click();
      await expect(page.getByRole("button", { name: "Unsave" })).toBeVisible({
        timeout: 20_000,
      });
    }

    await page.goto("/app/alerts");
    await expect(page.getByText("CANARY BUYER NEVER FREE").first()).toBeVisible();
    await expect(page.getByText(/CANARY SOURCE TITLE NEVER FREE/i)).toBeVisible();

    await page.goto(`/app/deals/${seed.publishedDealId}`);
    await expect(page.getByRole("button", { name: /Export this opportunity as CSV|Export CSV/ })).toBeVisible();
    const exported = await page.request.post("/api/exports", {
      headers: { Accept: "text/csv", "content-type": "application/json" },
      data: { dealIds: [seed.publishedDealId] },
    });
    expect(exported.ok()).toBeTruthy();
    const csv = await exported.text();
    expect(csv).toContain("CANARY SOURCE TITLE NEVER FREE");
    expect(exported.headers()["content-disposition"] ?? "").toMatch(
      /dealatlas-deals-.*\.csv/i,
    );

    await page.goto("/app/billing");
    await expect(page.getByText("Pro monthly", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage billing" })).toBeVisible();
    const attackerCustomer = `cus_other_${randomUUID()}`;
    const portalResult = await page.request.post(
      `/api/billing/portal?customer_id=${attackerCustomer}`,
    );
    const portalText = await portalResult.text();
    expect(portalText).not.toContain(attackerCustomer);
    expect([200, 303, 401, 404, 429, 502, 503]).toContain(portalResult.status());
  });
});
