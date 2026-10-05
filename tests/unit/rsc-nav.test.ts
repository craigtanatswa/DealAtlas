import { describe, expect, it } from "vitest";

import { navigationRscCount } from "../leak/lib/rsc-nav";

const slug = "/deals/grounds-maintenance-services-4c1e9a07";

describe("card navigation RSC count", () => {
  it("counts a prefetch that finished before the click", () => {
    const count = navigationRscCount(
      {
        rsc: [
          { url: "http://127.0.0.1:3100/deals?_rsc=index" },
          { url: `http://127.0.0.1:3100${slug}?_rsc=prefetch` },
        ],
        responses: [],
      },
      slug,
    );
    expect(count).toBe(1);
  });

  it("counts an inline flight document and ignores unrelated HTML", () => {
    const count = navigationRscCount(
      {
        rsc: [],
        responses: [
          { url: `http://127.0.0.1:3100${slug}`, contentType: "text/html; charset=utf-8", body: "<html><script>self.__next_f.push(1)</script></html>" },
          { url: "http://127.0.0.1:3100/deals", contentType: "text/html", body: "self.__next_f.push(1)" },
          { url: `http://127.0.0.1:3100${slug}?plain=1`, contentType: "text/html", body: "<html>no flight</html>" },
        ],
      },
      slug,
    );
    expect(count).toBe(1);
  });

  it("counts a text/x-component response for the same path", () => {
    expect(
      navigationRscCount(
        {
          rsc: [],
          responses: [
            { url: `http://127.0.0.1:3100${slug}`, contentType: "text/x-component", body: "" },
          ],
        },
        slug,
      ),
    ).toBe(1);
  });

  it("is zero when nothing is tied to the card", () => {
    expect(navigationRscCount({ rsc: [{ url: "http://127.0.0.1:3100/deals?_rsc=1" }], responses: [] }, slug)).toBe(0);
    expect(navigationRscCount({ rsc: [], responses: [] }, "")).toBe(0);
  });
});
