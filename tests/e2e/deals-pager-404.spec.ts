import { expect, test } from "@playwright/test";

import { PUBLIC_DEALS_MAX_PAGES } from "../../lib/search/params";

test.describe("/deals pager reach", () => {
  test("pages past the pager return a real 404; the pager never links past the cap", async ({
    request,
  }) => {
    const first = await request.get("/deals");
    expect(first.status()).toBe(200);
    const html = await first.text();
    const linked = [...html.matchAll(/href="\/deals\?(?:[^"]*&amp;)?page=(\d+)/g)].map((m) =>
      Number(m[1]),
    );
    const maxLinked = Math.max(1, ...linked);
    expect(maxLinked).toBeLessThanOrEqual(PUBLIC_DEALS_MAX_PAGES);

    for (const page of [maxLinked + 1, PUBLIC_DEALS_MAX_PAGES + 1, 7, 34]) {
      const response = await request.get(`/deals?page=${page}`, { maxRedirects: 0 });
      expect(response.status(), `page=${page}`).toBe(404);
    }
    const last = await request.get(`/deals?page=${maxLinked}`, { maxRedirects: 0 });
    expect(last.status()).toBe(200);
  });
});
