import { expect, test } from "@playwright/test";

import { PUBLIC_DEALS_PAGE_SIZE } from "../../lib/search/params";

test.describe("/deals pager reach", () => {
  test("every page up to the real last page loads; only the page after it is a real 404", async ({
    request,
  }) => {
    const first = await request.get("/deals");
    expect(first.status()).toBe(200);
    const html = await first.text();
    const total = Number(html.match(/Showing[\s\S]{0,120}?of\s*(?:<!-- -->)?\s*(\d+)/)?.[1]);
    expect(total).toBeGreaterThan(0);
    const lastPage = Math.ceil(total / PUBLIC_DEALS_PAGE_SIZE);
    const linked = [...html.matchAll(/href="\/deals\?(?:[^"]*&amp;)?page=(\d+)/g)].map((m) =>
      Number(m[1]),
    );
    expect(Math.max(1, ...linked)).toBe(lastPage);

    for (let page = 2; page <= lastPage; page += 1) {
      const response = await request.get(`/deals?page=${page}`, { maxRedirects: 0 });
      expect(response.status(), `page=${page}`).toBe(200);
    }
    for (const page of [lastPage + 1, lastPage + 5]) {
      const response = await request.get(`/deals?page=${page}`, { maxRedirects: 0 });
      expect(response.status(), `page=${page}`).toBe(404);
    }
  });
});
