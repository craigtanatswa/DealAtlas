import type { Page } from "@playwright/test";

/**
 * Submits the keyword form that owns #search-q. The site header has its own
 * icon-only "Search" button, so a page-wide role lookup is ambiguous.
 */
export async function submitKeywordSearch(page: Page) {
  await page
    .locator("form", { has: page.locator("#search-q") })
    .getByRole("button", { name: "Search", exact: true })
    .click();
}
