import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { expectNoProtectedLeaks, findProtectedMarkerLeaks } from "./helpers/leaks";
import { readSeed } from "./helpers/seed";

test.describe("Free account journey", () => {
  test("Login → profile → relevance → save preview → saved search → locked Deal → Checkout", async ({
    page,
  }) => {
    const seed = readSeed();
    await loginAs(page, seed.free);

    await page.goto("/app/profile");
    await page.getByLabel("Company name").fill("E2E Free Supplier");
    await page.getByRole("textbox", { name: "Keywords", exact: true }).fill(
      `${seed.searchToken}\nmanaged\nsupport`,
    );
    await page.getByRole("button", { name: "Save company profile" }).click();
    await expect(page.getByRole("status")).toContainText("Company profile saved", {
      timeout: 20_000,
    });
    await expectNoProtectedLeaks(page);

    await page.goto("/app/search");
    await page.locator("#search-q").fill(seed.searchToken);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: seed.previewTitle })).toBeVisible();
    await expect(page.getByLabel(/Match score \d+/i)).toBeVisible();
    await expectNoProtectedLeaks(page);

    await page.goto(`/deals/${seed.publishedSlug}`);
    await page.getByRole("button", { name: "Save opportunity" }).click();
    await expect(page.getByRole("button", { name: "Unsave" })).toBeVisible({
      timeout: 20_000,
    });
    await expectNoProtectedLeaks(page);

    await page.goto("/app/search");
    await page.locator("#search-q").fill(seed.searchToken);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByLabel("Save this search").fill(`E2E ${seed.searchToken}`);
    await page.getByRole("button", { name: "Save search" }).click();
    await expect(
      page.getByRole("status").or(page.getByText(/Free accounts can save one search/i)),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto("/app/searches");
    await expect(page.getByRole("heading", { name: `E2E ${seed.searchToken}` })).toBeVisible();
    await expectNoProtectedLeaks(page);

    await page.goto(`/app/deals/${seed.publishedDealId}`);
    await expect(
      page.getByText("Join DealAtlas Pro to unlock the buyer", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Unlock with DealAtlas Pro" }),
    ).toBeVisible();
    await expectNoProtectedLeaks(page);

    const paid = await page.request.get(`/api/deals/${seed.publishedDealId}`);
    expect(paid.status()).toBe(403);
    expect(findProtectedMarkerLeaks(await paid.text())).toEqual([]);

    const checkout = await page.request.post("/api/billing/checkout", {
      headers: { Accept: "application/json", "content-type": "application/json" },
      data: { planKey: "PRO_MONTHLY" },
    });
    expect([200, 303, 400, 401, 502, 503]).toContain(checkout.status());
    expect(findProtectedMarkerLeaks(await checkout.text())).toEqual([]);

    await page.goto("/app/alerts");
    await expect(page.getByText(/Join DealAtlas Pro/i).first()).toBeVisible();
    await expectNoProtectedLeaks(page);
  });
});
