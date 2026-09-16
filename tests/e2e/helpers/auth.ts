import { expect, type Page } from "@playwright/test";

import type { E2EAccount } from "./types";

export async function loginAs(page: Page, account: E2EAccount): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(app|admin)(\/|$)/);
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
}
