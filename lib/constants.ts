export const APP_NAME = "DealAtlas";

export const APP_DESCRIPTION =
  "UK-first B2B opportunity intelligence. Find contracts, assess fit, and unlock who is buying after you subscribe.";

export const ROLES = {
  USER: "USER",
  ADMIN: "ADMIN",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const PLANS = {
  FREE: "FREE",
  PRO: "PRO",
} as const;

export type Plan = (typeof PLANS)[keyof typeof PLANS];

export const UNLIMITED = null;

export const FEATURE_LIMITS = {
  FREE: {
    savedDeals: 5,
    savedSearches: 1,
    watchedBuyers: 0,
    watchedSuppliers: 0,
    exportRowsPerMonth: 0,
  },
  PRO: {
    savedDeals: UNLIMITED,
    savedSearches: 50,
    watchedBuyers: 50,
    watchedSuppliers: 50,
    exportRowsPerMonth: 1000,
  },
} as const;

export type FeatureLimits = (typeof FEATURE_LIMITS)[Plan];

export const DISPLAY_PRICING = {
  currency: "GBP",
  proMonthly: "£39/month",
  proAnnual: "£390/year",
} as const;

export const PUBLIC_NAV = [
  { href: "/deals", label: "Find Deals" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/pricing", label: "Pricing" },
] as const;

export const AUTH_NAV = [
  { href: "/login", label: "Sign In" },
  { href: "/signup", label: "Get Started" },
] as const;

export const APP_NAV = [
  { href: "/app/search", label: "Discover" },
  { href: "/app/saved", label: "Saved" },
  { href: "/app/searches", label: "Searches" },
  { href: "/app/alerts", label: "Alerts" },
  { href: "/app/buyers", label: "Buyers", pro: true },
  { href: "/app/suppliers", label: "Suppliers", pro: true },
  { href: "/app/contracts", label: "Contracts", pro: true },
  { href: "/app/renewals", label: "Renewals", pro: true },
] as const;

export const ACCOUNT_NAV = [
  { href: "/app/profile", label: "Account" },
  { href: "/app/billing", label: "Billing" },
  { href: "/app/settings", label: "Settings" },
] as const;

export const FOOTER_NAV = [
  { href: "/deals", label: "Find Deals" },
  { href: "/categories", label: "Categories" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/cookies", label: "Cookies" },
  { href: "/contact", label: "Contact" },
] as const;

export const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/deals", label: "Deals" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/ingestion", label: "Ingestion" },
  { href: "/admin/organisations", label: "Organisations" },
  { href: "/admin/deduplication", label: "Deduplication" },
  { href: "/admin/data-quality", label: "Data quality" },
  { href: "/admin/billing-events", label: "Billing events" },
] as const;

export const BUYER_SECTORS = [
  "PUBLIC",
  "PRIVATE",
  "NONPROFIT",
  "UTILITY",
  "EDUCATION",
  "HEALTHCARE",
  "OTHER",
] as const;

export type BuyerSector = (typeof BUYER_SECTORS)[number];

export const BUYER_SECTOR_LABELS: Record<BuyerSector, string> = {
  PUBLIC: "Public",
  PRIVATE: "Private",
  NONPROFIT: "Non-profit",
  UTILITY: "Utility",
  EDUCATION: "Education",
  HEALTHCARE: "Healthcare",
  OTHER: "Other",
};
