import { expect, test } from "@playwright/test";

import { expectNoProtectedLeaks, findProtectedMarkerLeaks } from "./helpers/leaks";
import { readSeed } from "./helpers/seed";
import { submitKeywordSearch } from "./helpers/search";

test.describe("Anonymous journey", () => {
  test("Homepage → Search → Preview → reveal attempts → Pricing/Signup", async ({
    page,
    request,
  }) => {
    const seed = readSeed();

    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /Find business opportunities worth pursuing/i,
      }),
    ).toBeVisible();
    await expectNoProtectedLeaks(page);

    await page.getByRole("link", { name: "Find Deals" }).first().click();
    await page.waitForURL(/\/deals/);
    await page.locator("#search-q").fill(seed.searchToken);
    await submitKeywordSearch(page);
    await expect(page.getByRole("heading", { name: seed.previewTitle })).toBeVisible();
    await expectNoProtectedLeaks(page);

    const searchJson = await request.get(`/api/search?q=${encodeURIComponent(seed.searchToken)}`);
    expect(searchJson.ok()).toBeTruthy();
    const searchText = await searchJson.text();
    expect(findProtectedMarkerLeaks(searchText)).toEqual([]);
    expect(searchText).toContain(seed.previewTitle);

    await page.getByRole("link", { name: seed.previewTitle }).click();
    await page.waitForURL(new RegExp(`/deals/${seed.publishedSlug}`));
    // Role queries skip the display:none copy of the card (mobile vs desktop).
    const proCard = page.getByRole("complementary", {
      name: "Unlock this opportunity with Pro",
    });
    await expect(proCard).toBeVisible();
    await expect(proCard.getByText("Buyer", { exact: true })).toBeVisible();
    await expect(proCard.getByText("How to apply", { exact: true })).toBeVisible();
    await expect(
      proCard.getByRole("link", { name: /Start Pro – £39\/mo|Become a founding member/ }),
    ).toBeVisible();
    await expectNoProtectedLeaks(page);

    const paid = await request.get(`/api/deals/${seed.publishedDealId}`);
    expect(paid.status()).toBe(401);
    expect(findProtectedMarkerLeaks(await paid.text())).toEqual([]);

    await page.getByRole("link", { name: "Pricing", exact: true }).first().click();
    await page.waitForURL(/\/pricing/);
    await expect(page.getByRole("heading", { name: "Pricing", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pro annual" })).toBeVisible();
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
