// @vitest-environment jsdom
import { createElement } from "react";

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  consented: true,
  pathname: "/guides/how-to-win-council-contracts",
}));

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  get_distinct_id: vi.fn(() => "019a0c1e-1111-7111-8111-111111111111"),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}));

vi.mock("@/hooks/use-analytics-consent", () => ({
  useAnalyticsConsent: () => state.consented,
}));

vi.mock("@/lib/analytics/bot", () => ({
  isAutomationTraffic: () => false,
}));

vi.mock("posthog-js/dist/module.slim.no-external", () => ({
  default: posthog,
}));

import { PostHogAnalytics } from "@/components/analytics/posthog-analytics";
import { resetGuideCtaViewsForTests } from "@/lib/analytics/guide-cta-views";

const KEY = "phc_TestKey0123456789abcdef";
const GUIDE_A = "/guides/how-to-win-council-contracts";
const GUIDE_B = "/guides/how-to-find-public-sector-tenders";

type EntryInit = {
  target: Element;
  isIntersecting?: boolean;
  intersectionRatio?: number;
};

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly elements = new Set<Element>();
  readonly callback: IntersectionObserverCallback;
  readonly options?: IntersectionObserverInit;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(entries: EntryInit[]) {
    this.callback(
      entries.map(
        ({ target, isIntersecting = true, intersectionRatio = 1 }) =>
          ({
            target,
            isIntersecting,
            intersectionRatio,
          }) as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    );
  }
}

const ctas = (
  <>
    {createElement(
      "a",
      {
        href: "/signup",
        "data-guide-cta-target": "signup",
        "data-guide-cta-position": "after_answer",
      },
      "Sign up",
    )}
    {createElement(
      "a",
      { href: "/deals", "data-guide-cta-target": "deals", "data-guide-cta-position": "mid" },
      "Deals",
    )}
    {createElement(
      "a",
      {
        href: "/pricing",
        "data-guide-cta-target": "pricing",
        "data-guide-cta-position": "end",
      },
      "Pricing",
    )}
  </>
);

function viewCaptures() {
  return posthog.capture.mock.calls.filter(([event]) => event === "guide_cta_viewed");
}

function latestObserver() {
  return MockIntersectionObserver.instances.at(-1);
}

function ctaElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLAnchorElement>("a[data-guide-cta-target]")];
}

function setPathname(pathname: string) {
  state.pathname = pathname;
  window.history.replaceState({}, "", pathname);
}

function intersect(observer: MockIntersectionObserver, targets: Element[], ratio = 1) {
  act(() => {
    observer.trigger(
      targets.map((target) => ({
        target,
        isIntersecting: true,
        intersectionRatio: ratio,
      })),
    );
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function expectViews(count: number) {
  await vi.waitFor(() => expect(viewCaptures()).toHaveLength(count));
}

function renderGuide() {
  return render(
    <>
      <PostHogAnalytics apiKey={KEY} />
      {ctas}
    </>,
  );
}

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  state.consented = true;
  setPathname(GUIDE_A);
  resetGuideCtaViewsForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("guide_cta_viewed dedupe", () => {
  it("does not fire at mount when the CTA is off-screen", async () => {
    const { container } = renderGuide();
    const observer = latestObserver();

    expect(observer).toBeDefined();
    expect(observer?.options).toMatchObject({ threshold: 0.5 });

    act(() => {
      observer?.trigger(
        ctaElements(container).map((target) => ({
          target,
          isIntersecting: false,
          intersectionRatio: 0,
        })),
      );
    });

    await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalledWith("$pageview"));
    await settle();

    expect(viewCaptures()).toHaveLength(0);
  });

  it("fires exactly once per CTA per page view across re-renders, consent toggles and repeated intersections", async () => {
    const { container, rerender } = renderGuide();
    const targets = ctaElements(container);

    intersect(latestObserver()!, targets);
    await expectViews(3);

    rerender(
      <>
        <PostHogAnalytics apiKey={KEY} />
        {ctas}
      </>,
    );
    await settle();
    expect(viewCaptures()).toHaveLength(3);

    state.consented = false;
    rerender(
      <>
        <PostHogAnalytics apiKey={KEY} />
        {ctas}
      </>,
    );

    state.consented = true;
    rerender(
      <>
        <PostHogAnalytics apiKey={KEY} />
        {ctas}
      </>,
    );

    intersect(latestObserver()!, targets);
    await settle();
    expect(viewCaptures()).toHaveLength(3);

    intersect(latestObserver()!, targets);
    await settle();
    expect(viewCaptures()).toHaveLength(3);

    setPathname(GUIDE_B);
    rerender(
      <>
        <PostHogAnalytics apiKey={KEY} />
        {ctas}
      </>,
    );
    intersect(latestObserver()!, targets);
    await expectViews(6);

    setPathname(GUIDE_A);
    rerender(
      <>
        <PostHogAnalytics apiKey={KEY} />
        {ctas}
      </>,
    );
    intersect(latestObserver()!, targets);
    await expectViews(9);

    const bySlug = viewCaptures().map(([, properties]) => properties);
    for (const target of ["signup", "deals", "pricing"]) {
      expect(
        bySlug.filter(
          (properties) =>
            properties.guide_slug === "how-to-win-council-contracts" &&
            properties.target === target,
        ),
      ).toHaveLength(2);
      expect(
        bySlug.filter(
          (properties) =>
            properties.guide_slug === "how-to-find-public-sector-tenders" &&
            properties.target === target,
        ),
      ).toHaveLength(1);
    }
  });

  it("does not fire below the 50% ratio", async () => {
    const { container } = renderGuide();
    const [first] = ctaElements(container);

    intersect(latestObserver()!, [first], 0.49);
    await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalledWith("$pageview"));
    await settle();
    expect(viewCaptures()).toHaveLength(0);

    intersect(latestObserver()!, [first], 0.5);
    await expectViews(1);
  });
});
