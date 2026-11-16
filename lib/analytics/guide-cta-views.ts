import {
  GUIDE_CTA_LINK_SELECTOR,
  GUIDE_CTA_POSITION_ATTR,
  GUIDE_CTA_TARGET_ATTR,
} from "@/lib/analytics/guide-cta";

export const GUIDE_CTA_VIEW_THRESHOLD = 0.5;

let pageViewKey: string | null = null;
let reportedCtaIds = new Set<string>();
let ctaIdByElement = new WeakMap<Element, string>();

export function resetGuideCtaViewsForTests(): void {
  pageViewKey = null;
  reportedCtaIds = new Set();
  ctaIdByElement = new WeakMap();
}

function beginPageView(pathname: string): void {
  if (pageViewKey === pathname) {
    return;
  }
  pageViewKey = pathname;
  reportedCtaIds = new Set();
}

function registerCtaIds(): void {
  const occurrences = new Map<string, number>();
  for (const element of document.querySelectorAll(GUIDE_CTA_LINK_SELECTOR)) {
    const position = element.getAttribute(GUIDE_CTA_POSITION_ATTR) ?? "";
    const target = element.getAttribute(GUIDE_CTA_TARGET_ATTR) ?? "";
    const pair = `${position}|${target}`;
    const occurrence = occurrences.get(pair) ?? 0;
    occurrences.set(pair, occurrence + 1);
    ctaIdByElement.set(element, `${pair}|${occurrence}`);
  }
}

export function startGuideCtaViewTracking(
  pathname: string,
  onView: (element: Element) => void,
): () => void {
  beginPageView(pathname);
  registerCtaIds();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < GUIDE_CTA_VIEW_THRESHOLD) {
          continue;
        }
        const id = ctaIdByElement.get(entry.target);
        if (!id || reportedCtaIds.has(id)) {
          continue;
        }
        reportedCtaIds.add(id);
        observer.unobserve(entry.target);
        onView(entry.target);
      }
    },
    { threshold: 0.5 },
  );
  for (const element of document.querySelectorAll(GUIDE_CTA_LINK_SELECTOR)) {
    observer.observe(element);
  }
  return () => observer.disconnect();
}
