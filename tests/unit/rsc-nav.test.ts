import { describe, expect, it } from "vitest";

import { abortPrefetch, appRouterFromNodes, navigationRscCount, type RscNavCursor } from "../leak/lib/rsc-nav";

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

  it("does not count the search results document", () => {
    const count = navigationRscCount(
      {
        rsc: [],
        responses: [
          {
            url: "http://127.0.0.1:3100/deals?q=grounds",
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

  it("counts a search flight on /deals recorded after the step starts", () => {
    const tracker = {
      rsc: [{ url: "http://127.0.0.1:3100/deals?_rsc=before" }],
      responses: [
        {
          url: "http://127.0.0.1:3100/deals?q=grounds",
          contentType: "text/html",
          body: "self.__next_f.push(1)",
        },
      ],
    };
    const since = { rsc: tracker.rsc.length, responses: tracker.responses.length };
    tracker.rsc.push({ url: "http://127.0.0.1:3100/deals?q=grounds&_rsc=click" });
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

const treeHeaders = {
  "next-router-prefetch": "1",
  "next-router-segment-prefetch": "/_tree",
};

describe("prefetch gate", () => {
  it("drops every prefetch tier when the step has not named a target", () => {
    expect(abortPrefetch({ "next-router-prefetch": "1" }, "http://127.0.0.1:3100/deals?_rsc=1", null)).toBe(true);
    expect(abortPrefetch({ "next-router-prefetch": "2" }, "http://127.0.0.1:3100/deals?_rsc=1", null)).toBe(true);
    expect(abortPrefetch({ "next-router-prefetch": "3" }, "http://127.0.0.1:3100/deals?_rsc=1", null)).toBe(true);
    expect(abortPrefetch(treeHeaders, "http://127.0.0.1:3100/deals?_rsc=1", null)).toBe(true);
  });

  it("keeps the soft-nav tree fetch for the step target and still drops other paths", () => {
    expect(abortPrefetch(treeHeaders, "http://127.0.0.1:3100/deals?_rsc=click", { exact: "/deals" })).toBe(false);
    expect(abortPrefetch(treeHeaders, "http://127.0.0.1:3100/deals/grounds-maintenance-services-4c1e9a07?_rsc=1", { exact: "/deals" })).toBe(true);
    expect(abortPrefetch(treeHeaders, "http://127.0.0.1:3100/categories/technology?_rsc=1", { prefix: "/categories" })).toBe(false);
    expect(abortPrefetch(treeHeaders, "http://127.0.0.1:3100/categories?_rsc=1", { prefix: "/categories" })).toBe(false);
    expect(abortPrefetch(treeHeaders, "http://127.0.0.1:3100/deals?_rsc=1", { prefix: "/categories" })).toBe(true);
  });

  it("never drops a full navigation that omits prefetch headers", () => {
    expect(abortPrefetch({ rsc: "1" }, "http://127.0.0.1:3100/deals?_rsc=click", null)).toBe(false);
  });
});

describe("app router lookup", () => {
  it("returns the router from a link fiber and ignores a lookalike", () => {
    const router = {
      push: () => undefined,
      replace: () => undefined,
      refresh: () => undefined,
      back: () => undefined,
      prefetch: () => undefined,
      bfcacheId: "route",
    };
    const lookalike = { push: () => undefined };
    const linkFiber = {
      dependencies: { firstContext: { memoizedValue: lookalike, next: { memoizedValue: router, next: null } } },
      return: null,
    };
    const host = { __reactFiber$test: { dependencies: null, return: linkFiber, alternate: null } };
    expect(appRouterFromNodes([host])).toBe(router);
    expect(appRouterFromNodes([{ __reactFiber$test: { dependencies: { firstContext: { memoizedValue: lookalike, next: null } }, return: null } }])).toBeNull();
  });
});
