import { describe, expect, it } from "vitest";

import { navigationRscCount, type RscNavCursor } from "../leak/lib/rsc-nav";

const slug = "/deals/grounds-maintenance-services-4c1e9a07";
const start: RscNavCursor = { rsc: 0, responses: 0 };

describe("navigation RSC count", () => {
  it("fails when the only capture is the /deals HTML document", () => {
    const count = navigationRscCount(
      {
        rsc: [],
        responses: [
          {
            url: "http://127.0.0.1:3100/deals",
            contentType: "text/html; charset=utf-8",
            body: "<html><script>self.__next_f.push(1)</script></html>",
          },
        ],
      },
      "/deals",
      start,
    );
    expect(count).toBe(0);
  });

  it("fails when the only flight was recorded before the step", () => {
    const tracker = {
      rsc: [{ url: "http://127.0.0.1:3100/deals?_rsc=prefetch" }],
      responses: [
        {
          url: `http://127.0.0.1:3100${slug}`,
          contentType: "text/html",
          body: "self.__next_f.push(1)",
        },
      ],
    };
    const since = { rsc: tracker.rsc.length, responses: tracker.responses.length };
    expect(navigationRscCount(tracker, "/deals", since)).toBe(0);
    expect(navigationRscCount(tracker, slug, since)).toBe(0);
  });

  it("counts a _rsc or text/x-component response added after the step starts", () => {
    const tracker = {
      rsc: [
        { url: "http://127.0.0.1:3100/deals?_rsc=before" },
        { url: `http://127.0.0.1:3100${slug}?_rsc=click` },
      ],
      responses: [
        { url: "http://127.0.0.1:3100/deals", contentType: "text/html", body: "self.__next_f.push(1)" },
        { url: "http://127.0.0.1:3100/deals?_rsc=click", contentType: "text/x-component", body: "" },
      ],
    };
    const since: RscNavCursor = { rsc: 1, responses: 1 };
    expect(navigationRscCount(tracker, slug, since)).toBe(1);
    expect(navigationRscCount(tracker, "/deals", since)).toBe(1);
  });

  it("does not let a deal-card flight satisfy the /deals step", () => {
    expect(
      navigationRscCount(
        {
          rsc: [{ url: `http://127.0.0.1:3100${slug}?_rsc=click` }],
          responses: [],
        },
        "/deals",
        start,
      ),
    ).toBe(0);
  });
});
