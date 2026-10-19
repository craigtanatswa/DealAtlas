import { expect, test, type Page } from "@playwright/test";

import { SEEDED_PROTECTED_MARKERS } from "../helpers/protected-leak";
import { loginAs } from "./helpers/auth";
import { captureIngest, capturedPathnames, type CapturedIngest } from "./helpers/ingest";
import { readSeed } from "./helpers/seed";
import type { E2ESeed } from "./helpers/types";
import { proActiveWebhookPayload, signedWebhookHeaders } from "./helpers/webhook";

/**
 * Security condition 6: load a free and a Pro deal page as a real free user
 * and a real Pro user, capture every /ingest payload, and assert it carries no
 * deal slug, deal ID, title, buyer name or query string.
 */

function forbiddenValues(seed: E2ESeed): string[] {
  return [
    seed.publishedSlug,
    seed.publishedDealId,
    seed.xssSlug,
    seed.xssDealId,
    seed.previewTitle,
    seed.searchToken,
    seed.organizationId,
    seed.sourceId,
    seed.free.id,
    seed.pro.id,
    seed.free.email,
    seed.pro.email,
    ...SEEDED_PROTECTED_MARKERS,
  ];
}

function expectNoDealData(captured: CapturedIngest[], seed: E2ESeed) {
  expect(captured.length, "no /ingest payloads were captured").toBeGreaterThan(0);
  for (const request of captured) {
    expect(request.url, "ingest URL").not.toMatch(/canary|e2e-published|e2e-xss/i);
    const lower = request.body.toLowerCase();
    for (const value of forbiddenValues(seed)) {
      expect(lower, `ingest payload contains ${value}`).not.toContain(value.toLowerCase());
    }
    expect(lower, "ingest payload carries the word canary").not.toContain("canary");
    expect(request.body, "ingest payload carries a query string").not.toMatch(/[?&](q|tab|page|region|subscription_id|payment_id|email)=/);
    expect(request.body, "ingest payload carries a fragment").not.toMatch(/#[a-z]/i);
    for (const banned of ["$title", "$initial_", "$session_entry_", "$prev_pageview_", "$host", "$set", "$raw_user_agent"]) {
      expect(request.body, `ingest payload carries ${banned}`).not.toContain(banned);
    }
  }
}

async function expectNoAnalyticsStorage(page: Page) {
  const cookies = await page.context().cookies();
  expect(cookies.filter((cookie) => /ph_|posthog/i.test(cookie.name))).toEqual([]);
  const keys = await page.evaluate(() => [
    ...Object.keys(window.localStorage),
    ...Object.keys(window.sessionStorage),
  ]);
  expect(keys.filter((key) => /ph_|posthog/i.test(key))).toEqual([]);
}

async function waitForPathnames(captured: CapturedIngest[], expected: string[]) {
  await expect
    .poll(() => {
      const seen = capturedPathnames(captured);
      return expected.every((path) => seen.includes(path));
    }, { timeout: 30_000 })
    .toBe(true);
}

test.describe("Analytics payloads carry no deal data", () => {
  // posthog-js drops events from a "HeadlessChrome" user agent (CI runs the
  // headless shell). Present a regular Chrome UA so real payloads are produced.
  test.use({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  });

  test("free user: public and workspace deal pages", async ({ page }) => {
    const seed = readSeed();
    const captured = await captureIngest(page);
    await loginAs(page, seed.free);

    await page.goto(
      `/deals/${seed.publishedSlug}?q=${encodeURIComponent(seed.previewTitle)}&utm_source=e2e&utm_medium=test#apply`,
    );
    await expect(page.getByRole("heading", { name: seed.previewTitle })).toBeVisible();
    await waitForPathnames(captured, ["/deals/[deal]"]);
    await page.goto(`/deals?q=${encodeURIComponent("CANARY BUYER NEVER FREE")}`);
    await waitForPathnames(captured, ["/deals"]);
    await page.goto(`/app/deals/${seed.publishedDealId}`);
    await expect(
      page.getByRole("complementary", { name: "Unlock this opportunity with Pro" }),
    ).toBeVisible();

    await waitForPathnames(captured, ["/deals/[deal]", "/deals", "/app/deals/[deal]"]);
    expectNoDealData(captured, seed);
    expect(captured.map((request) => request.body).join("\n")).toContain('"utm_source":"e2e"');
    await expectNoAnalyticsStorage(page);
  });

  test("Pro user: unlocked deal page with buyer and source details", async ({ page, request }) => {
    const seed = readSeed();
    // Same subscription as pro.spec.ts, but an older event, so either file can run first.
    const payload = proActiveWebhookPayload({
      userId: seed.pro.id,
      email: seed.pro.email,
      subscriptionId: `sub_e2e_${seed.suffix}`,
      customerId: `cus_e2e_${seed.suffix}`,
      now: new Date(Date.now() - 5 * 60_000),
    });
    const body = JSON.stringify(payload);
    const applied = await request.post("/api/webhooks/dodo", {
      headers: signedWebhookHeaders(body, `evt_e2e_analytics_${seed.suffix}`),
      data: body,
    });
    expect(applied.ok()).toBeTruthy();

    const captured = await captureIngest(page);
    await loginAs(page, seed.pro);

    await page.goto(`/app/deals/${seed.publishedDealId}?tab=buyer#contacts`);
    await expect(page.getByText("CANARY BUYER NEVER FREE").first()).toBeVisible();
    await waitForPathnames(captured, ["/app/deals/[deal]"]);
    await page.goto(`/deals/${seed.publishedSlug}`);
    await waitForPathnames(captured, ["/deals/[deal]"]);
    await page.goto("/app/buyers");
    await expect(page.getByText("CANARY BUYER NEVER FREE").first()).toBeVisible();

    await waitForPathnames(captured, ["/app/deals/[deal]", "/deals/[deal]", "/app/buyers"]);
    expectNoDealData(captured, seed);
    await expectNoAnalyticsStorage(page);
  });
});
