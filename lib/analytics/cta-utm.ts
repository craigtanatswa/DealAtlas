/**
 * Part A organic CTAs. Deal pages always use DEAL_PAGE_UTM_CONTENT: never a
 * deal id, slug, sector, region, buyer or source.
 */
export const CTA_UTM = {
  utm_source: "dealatlas",
  utm_medium: "organic",
  utm_campaign: "lifetime",
} as const;

export const DEAL_PAGE_UTM_CONTENT = "deal-page";

export function ctaUtmQuery(content: string): string {
  const params = new URLSearchParams();
  params.set("utm_source", CTA_UTM.utm_source);
  params.set("utm_medium", CTA_UTM.utm_medium);
  params.set("utm_campaign", CTA_UTM.utm_campaign);
  params.set("utm_content", content);
  return params.toString();
}

export function withCtaUtm(path: string, content: string): string {
  const hashIndex = path.indexOf("#");
  const base = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : path.slice(hashIndex);
  const separator = base.includes("?")
    ? base.endsWith("?") || base.endsWith("&")
      ? ""
      : "&"
    : "?";
  return `${base}${separator}${ctaUtmQuery(content)}${hash}`;
}
