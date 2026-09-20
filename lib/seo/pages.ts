import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

export const PUBLIC_INDEXABLE_PATHS = [
  "/",
  "/deals",
  "/pricing",
  "/how-it-works",
  "/contact",
  "/privacy",
  "/terms",
  "/cookies",
  "/categories",
] as const;

export type PublicIndexablePath = (typeof PUBLIC_INDEXABLE_PATHS)[number];

export const ROBOTS_DISALLOW = [
  "/app",
  "/app/",
  "/admin",
  "/admin/",
  "/api/",
  "/auth/",
  "/checkout/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/design-system",
  "/deals?",
] as const;

export const PUBLIC_PAGE_COPY = {
  home: {
    title: `${APP_NAME} · UK B2B opportunity intelligence`,
    description: APP_DESCRIPTION,
    path: "/",
  },
  deals: {
    title: "Discover opportunities",
    description:
      "Browse UK contract opportunities, supply requests and deals. Join DealAtlas Pro to unlock buyer identity and original sources.",
    path: "/deals",
  },
  pricing: {
    title: "Pricing",
    description:
      "Unlock buyer identity, source links, and documents after a verified DealAtlas Pro subscription. Display prices are commercial copy; checkout uses server-configured products.",
    path: "/pricing",
  },
  howItWorks: {
    title: "How it works",
    description:
      "Discover opportunities, assess fit, then unlock buyer and source details after a verified Pro subscription.",
    path: "/how-it-works",
  },
  contact: {
    title: "Contact",
    description:
      "How to reach DealAtlas about the product, privacy, or billing. Live inbox details still require business review before launch.",
    path: "/contact",
  },
  privacy: {
    title: "Privacy",
    description:
      "How DealAtlas handles account data, opportunity previews, and protected buyer or source identity. Draft wording pending legal review.",
    path: "/privacy",
  },
  terms: {
    title: "Terms",
    description:
      "Terms of use for DealAtlas accounts, subscriptions, and opportunity intelligence. Draft wording pending legal review.",
    path: "/terms",
  },
  cookies: {
    title: "Cookies",
    description:
      "Cookies DealAtlas uses for authentication and optional measurement. Draft wording pending legal review.",
    path: "/cookies",
  },
  categories: {
    title: "Opportunity categories",
    description:
      "Curated DealAtlas category landings for UK procurement and supply-chain opportunities. These pages explain the category; they are not mass-generated search filters.",
    path: "/categories",
  },
} as const;

export const HOW_IT_WORKS_STEPS = [
  {
    title: "Discover the opportunity",
    body: "Search by category, region, value band, and closing window. Join DealAtlas Pro when an opportunity is worth unlocking.",
  },
  {
    title: "Understand commercial fit",
    body: "Use the summary, requirement themes, SME suitability, and bid complexity to decide whether the opportunity is worth pursuing.",
  },
  {
    title: "Subscribe to reveal the source",
    body: "A verified Pro subscription unlocks buyer identity, exact source links, dates, contacts, and documents. A checkout redirect is not entitlement.",
  },
  {
    title: "Act, save, and monitor",
    body: "Save deals, keep searches, and receive alerts for new matches and material changes. Join DealAtlas Pro to unlock buyer and source details.",
  },
] as const;
