import {
  GUIDE_CTA_POSITIONS,
  GUIDE_CTA_TARGETS,
  isKnownGuideSlug,
} from "@/lib/analytics/events";

export type GuideCtaPosition = (typeof GUIDE_CTA_POSITIONS)[number];
export type GuideCtaTarget = (typeof GUIDE_CTA_TARGETS)[number];

/** Data attributes a guide CTA link carries. Values are enums only: no deal data. */
export const GUIDE_CTA_POSITION_ATTR = "data-guide-cta-position";
export const GUIDE_CTA_TARGET_ATTR = "data-guide-cta-target";

const TARGET_BY_PATH: Record<string, GuideCtaTarget> = {
  "/deals": "deals",
  "/signup": "signup",
  "/pricing": "pricing",
};

/** A guide link is a CTA only when it points exactly at /deals, /signup or /pricing. */
export function guideCtaTarget(href: string): GuideCtaTarget | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const pathOnly = href.split(/[?#]/)[0].replace(/(.)\/$/, "$1");
  return TARGET_BY_PATH[pathOnly] ?? null;
}

function isPosition(value: unknown): value is GuideCtaPosition {
  return typeof value === "string" && (GUIDE_CTA_POSITIONS as readonly string[]).includes(value);
}

function isTarget(value: unknown): value is GuideCtaTarget {
  return typeof value === "string" && (GUIDE_CTA_TARGETS as readonly string[]).includes(value);
}

const GUIDE_PATH = /^\/guides\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

/**
 * Builds guide_cta_clicked properties from a clicked element on a guide page.
 * The slug comes from the page path and must be a known guide; position and
 * target must be allow-listed enums. Anything else returns null (no event).
 */
export function guideCtaClickProperties(
  element: { closest(selector: string): { getAttribute(name: string): string | null } | null } | null,
  pathname: string,
): { guide_slug: string; cta_position: GuideCtaPosition; cta_target: GuideCtaTarget } | null {
  const slug = GUIDE_PATH.exec(pathname)?.[1];
  if (!element || !isKnownGuideSlug(slug)) return null;
  const link = element.closest(`a[${GUIDE_CTA_TARGET_ATTR}]`);
  if (!link) return null;
  const position = link.getAttribute(GUIDE_CTA_POSITION_ATTR);
  const target = link.getAttribute(GUIDE_CTA_TARGET_ATTR);
  if (!isPosition(position) || !isTarget(target)) return null;
  return { guide_slug: slug, cta_position: position, cta_target: target };
}
