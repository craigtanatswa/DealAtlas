import { expect, type Page } from "@playwright/test";

import { findProtectedMarkerLeaks } from "../../helpers/protected-leak";

export async function expectNoProtectedLeaks(
  page: Page,
  extraPayloads: string[] = [],
): Promise<void> {
  const html = await page.content();
  expect(findProtectedMarkerLeaks(html), "HTML leak").toEqual([]);

  const rsc = await page.request.get(page.url(), {
    headers: {
      RSC: "1",
      "Next-Router-State-Tree": encodeURIComponent('["",{},null,null]'),
    },
  });
  expect(findProtectedMarkerLeaks(await rsc.text()), "RSC leak").toEqual([]);

  for (const payload of extraPayloads) {
    expect(findProtectedMarkerLeaks(payload), "payload leak").toEqual([]);
  }
}

export { findProtectedMarkerLeaks };
