import { expect, test } from "@playwright/test";

import { expectNoProtectedLeaks, findProtectedMarkerLeaks } from "./helpers/leaks";
import { readSeed } from "./helpers/seed";

test.describe("Anonymous journey", () => {
  test("Homepage → Search → Preview → reveal attempts → Pricing/Signup", async ({
    page,
    request,
  }) => {
    const seed = readSeed();

    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /Find opportunities worth pursuing/i,
      }),
    ).toBeVisible();
    await expectNoProtectedLeaks(page);

    await page.getByRole("link", { name: "Find Deals" }).first().click();
    await page.waitForURL(/\/deals/);
    await page.locator("#search-q").fill(seed.searchToken);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: seed.previewTitle })).toBeVisible();
    await expectNoProtectedLeaks(page);

    const searchJson = await request.get(`/api/search?q=${encodeURIComponent(seed.searchToken)}`);
    expect(searchJson.ok()).toBeTruthy();
    const searchText = await searchJson.text();
    expect(findProtectedMarkerLeaks(searchText)).toEqual([]);
    expect(searchText).toContain(seed.previewTitle);

    await page.getByRole("link", { name: seed.previewTitle }).click();
    await page.waitForURL(new RegExp(`/deals/${seed.publishedSlug}`));
    await expect(page.getByText(/Join DealAtlas Pro to unlock the buyer/i)).toBeVisible();
    await expect(page.getByText("Buyer identity", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Unlock with DealAtlas Pro" }),
    ).toBeVisible();
    await expectNoProtectedLeaks(page);

    const paid = await request.get(`/api/deals/${seed.publishedDealId}`);
    expect(paid.status()).toBe(401);
    expect(findProtectedMarkerLeaks(await paid.text())).toEqual([]);

    await page.getByRole("link", { name: "View pricing" }).click();
    await page.waitForURL(/\/pricing/);
    await expect(page.getByRole("heading", { name: "DealAtlas Pro" })).toBeVisible();
    await expectNoProtectedLeaks(page);

    await page.getByRole("link", { name: "Get Started" }).first().click();
    await page.waitForURL(/\/signup/);
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign up / Sign in with Google" }),
    ).toBeVisible();
    await expectNoProtectedLeaks(page);
  });
});
