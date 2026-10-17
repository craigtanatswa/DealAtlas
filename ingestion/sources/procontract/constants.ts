import type { AllowedFetchPolicy } from "@/ingestion/core/http";

export const PROCONTRACT_HOST = "procontract.due-north.com";
export const PROCONTRACT_ORIGIN = `https://${PROCONTRACT_HOST}`;
export const PROCONTRACT_TERMS_URL = `${PROCONTRACT_ORIGIN}/SiteInformation/TermsAndConditions`;
export const PROCONTRACT_ROBOTS_URL = `${PROCONTRACT_ORIGIN}/robots.txt`;
export const PROCONTRACT_PARSER_VERSION = "procontract-html-1";
export const PROCONTRACT_USER_AGENT =
  "DealAtlas-ingest/1.0 (+https://www.dealatlas.uk; public-procurement-index; max 6 requests/minute)";
export const PROCONTRACT_MAX_REQUESTS_PER_MINUTE = 6;
export const PROCONTRACT_REQUEST_WINDOW_MS = 60_000;

/** Listing index, portal shortcut, and public advert page. Login and registers stay off this list. */
export const PROCONTRACT_FETCH_POLICY: AllowedFetchPolicy = {
  protocol: "https:",
  hosts: [PROCONTRACT_HOST],
  pathPrefixes: ["/Opportunities/portal/", "/Opportunities/Index", "/Advert"],
};

export const OPEN_NOTICE_SOURCE_KEYS = ["find-a-tender", "contracts-finder"] as const;

export type ProcontractReuseStatus = "UNKNOWN" | "PROHIBITED";

export type ProcontractPortal = {
  sourceKey: string;
  name: string;
  /** Public listing. Null when no stable public list exists. */
  listingUrl: string | null;
  /** Public RSS or export. Prefer this over HTML when set. None of these portals published one. */
  rssUrl: string | null;
  termsUrl: string;
  robotsUrl: string;
  /** Path prefixes robots.txt Disallow. Empty means the published file allows the path. */
  robotsDisallow: readonly string[];
  /**
   * Live fetch stays off unless terms explicitly allow automated access and reuse.
   * Every portal checked on 14 October 2026 is false.
   */
  fetchPermitted: boolean;
  reuseStatus: ProcontractReuseStatus;
  scrapingPermitted: false;
  enabled: false;
};

export const THE_CHEST_SOURCE_KEY = "the-chest";
export const KENT_BUSINESS_PORTAL_SOURCE_KEY = "kent-business-portal";
export const SOURCE_LEICESTERSHIRE_SOURCE_KEY = "source-leicestershire";
export const ESSEX_PROCONTRACT_SOURCE_KEY = "essex-procontract";

export const PROCONTRACT_PORTALS: readonly ProcontractPortal[] = [
  {
    sourceKey: THE_CHEST_SOURCE_KEY,
    name: "The Chest",
    listingUrl: `${PROCONTRACT_ORIGIN}/Opportunities/portal/thechest`,
    rssUrl: null,
    termsUrl: PROCONTRACT_TERMS_URL,
    robotsUrl: PROCONTRACT_ROBOTS_URL,
    robotsDisallow: [],
    fetchPermitted: false,
    reuseStatus: "PROHIBITED",
    scrapingPermitted: false,
    enabled: false,
  },
  {
    sourceKey: KENT_BUSINESS_PORTAL_SOURCE_KEY,
    name: "Kent Business Portal",
    listingUrl: `${PROCONTRACT_ORIGIN}/Opportunities/portal/kentbusinessportal`,
    rssUrl: null,
    termsUrl: "https://www.kentbusinessportal.org.uk/terms-and-conditions/",
    robotsUrl: "https://www.kentbusinessportal.org.uk/robots.txt",
    robotsDisallow: [],
    fetchPermitted: false,
    reuseStatus: "PROHIBITED",
    scrapingPermitted: false,
    enabled: false,
  },
  {
    sourceKey: SOURCE_LEICESTERSHIRE_SOURCE_KEY,
    name: "Source Leicestershire",
    listingUrl: `${PROCONTRACT_ORIGIN}/Opportunities/portal/eastmidstenders`,
    rssUrl: null,
    termsUrl: PROCONTRACT_TERMS_URL,
    robotsUrl: PROCONTRACT_ROBOTS_URL,
    robotsDisallow: [],
    fetchPermitted: false,
    reuseStatus: "PROHIBITED",
    scrapingPermitted: false,
    enabled: false,
  },
  {
    sourceKey: ESSEX_PROCONTRACT_SOURCE_KEY,
    name: "Essex ProContract",
    listingUrl: null,
    rssUrl: null,
    termsUrl: PROCONTRACT_TERMS_URL,
    robotsUrl: "https://www.essex.gov.uk/robots.txt",
    robotsDisallow: [
      "/admin/",
      "/search/",
      "/user/login",
      "/user/register",
      "/user/password",
      "/user/logout",
    ],
    fetchPermitted: false,
    reuseStatus: "UNKNOWN",
    scrapingPermitted: false,
    enabled: false,
  },
];

export function procontractPortal(sourceKey: string): ProcontractPortal | null {
  return PROCONTRACT_PORTALS.find((portal) => portal.sourceKey === sourceKey) ?? null;
}

export function isProcontractSourceKey(sourceKey: string): boolean {
  return procontractPortal(sourceKey) != null;
}

/** Terms or robots.txt that explicitly ban scraping or commercial reuse get no fetcher. */
export function procontractFetcherAllowed(portal: ProcontractPortal): boolean {
  return portal.reuseStatus !== "PROHIBITED";
}

export function pathBlockedByRobots(pathname: string, disallow: readonly string[]): boolean {
  return disallow.some((rule) => rule.length > 0 && pathname.startsWith(rule));
}
