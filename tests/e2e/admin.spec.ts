import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { findProtectedMarkerLeaks } from "./helpers/leaks";
import { readSeed } from "./helpers/seed";

test.describe("Admin journey", () => {
  test("Login → source registry → ingestion run → canonical Deal → preview leak review", async ({
    page,
  }) => {
    const seed = readSeed();
    await loginAs(page, seed.admin);

    await page.goto("/admin/sources");
    await expect(page.getByRole("heading", { name: "Source registry" })).toBeVisible();
    await expect(page.getByText("Find a Tender")).toBeVisible();

    const findATender = page.getByRole("row").filter({ hasText: "Find a Tender" });
    await findATender.getByRole("button", { name: "Run ingestion" }).click();
    const ingestOutcome = page.getByRole("status").or(page.getByRole("alert")).first();
    await expect(ingestOutcome).toBeVisible({ timeout: 90_000 });
    await expect(ingestOutcome).toContainText(/Ingestion |skipped|failed|could not/i);

    await page.goto("/admin/ingestion");
    await expect(page.getByRole("heading", { name: "Ingestion" })).toBeVisible();

    await page.goto(`/admin/deals/${seed.publishedDealId}`);
    await expect(
      page.getByRole("heading", { name: /CANARY SOURCE TITLE NEVER FREE/i }),
    ).toBeVisible();
    await expect(page.getByText("CANARY BUYER NEVER FREE").first()).toBeVisible();

    await page.goto("/admin/data-quality");
    await expect(page.getByRole("heading", { name: "Data quality" })).toBeVisible();
    await expect(page.getByText(/Unpublished previews/i)).toBeVisible();
  });

  test("non-admin cannot open the operations console", async ({ browser }) => {
    const seed = readSeed();
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, seed.free);
    const blocked = await page.request.get("/admin");
    const blockedHtml = await blocked.text();
    expect(blockedHtml).toMatch(/Access denied/i);
    expect(blockedHtml).not.toMatch(/Source registry/i);
    expect(findProtectedMarkerLeaks(blockedHtml)).toEqual([]);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Source registry" })).toHaveCount(0);
    expect(findProtectedMarkerLeaks(await page.content())).toEqual([]);
    await context.close();
  });
});
