import { expect, test } from "@playwright/test";

import { findProtectedMarkerLeaks } from "./helpers/leaks";
import { readSeed } from "./helpers/seed";

// What a crawler gets without running JavaScript: the first HTML response.
function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

test.describe("Crawler SSR", () => {
  test("/deals and the deal page render real deal content in the HTML", async ({ request }) => {
    const seed = readSeed();
    const title = htmlEscape(seed.previewTitle);

    for (const path of [
      `/deals?q=${encodeURIComponent(seed.searchToken)}`,
      `/deals/${seed.publishedSlug}`,
    ]) {
      const response = await request.get(path, {
        headers: { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
      });
      expect(response.status(), path).toBe(200);
      const html = await response.text();
      expect(html, path).toContain(title);
      expect(html, path).not.toMatch(/Loading opportunit/i);
      // Title is in the first render, not only in a streamed hidden boundary.
      expect(html.indexOf(title), path).toBeLessThan(
        html.indexOf('<div hidden id="S:') === -1 ? Infinity : html.indexOf('<div hidden id="S:'),
      );
      expect(findProtectedMarkerLeaks(html), path).toEqual([]);
    }
  });
});
