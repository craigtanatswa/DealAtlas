import { expect, test, type Page } from "@playwright/test";

const TRACKER_REQUEST =
  /\/ingest(?:\/|$)|googletagmanager\.com\/(?:gtm|gtag)(?:[/?]|$)/;

function watchTrackerRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (TRACKER_REQUEST.test(request.url())) {
      requests.push(request.url());
    }
  });
  return requests;
}

async function expectNoPostHogStorage(page: Page): Promise<void> {
  const cookies = await page.context().cookies();
  expect(cookies.filter((cookie) => /^ph_|posthog/i.test(cookie.name))).toEqual([]);
  const keys = await page.evaluate(() =>
    [...Object.keys(window.localStorage), ...Object.keys(window.sessionStorage)].filter(
      (key) => /^ph_|posthog/i.test(key),
    ),
  );
  expect(keys).toEqual([]);
}

test.describe("analytics consent gate", () => {
  test("sends no analytics before consent or after rejection", async ({ page }) => {
    const trackerRequests = watchTrackerRequests(page);

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Reject analytics" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept analytics" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    expect(trackerRequests).toEqual([]);
    await expectNoPostHogStorage(page);

    await page.getByRole("button", { name: "Reject analytics" }).click();
    await expect(page.getByRole("button", { name: "Reject analytics" })).toHaveCount(0);
    await page.waitForTimeout(500);

    expect(trackerRequests).toEqual([]);
    await expectNoPostHogStorage(page);
  });
});
