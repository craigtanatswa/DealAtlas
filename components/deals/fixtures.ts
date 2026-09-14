import type { DealCardData } from "@/components/deals/types";
import type { PublicDealPreview } from "@/lib/search/dto";

/**
 * Dummy fixtures for component stories and tests.
 * These are not live product statistics and must not be shown as such.
 */
export const DEAL_CARD_FIXTURES = {
  freePreview: {
    slug: "cloud-contact-centre-platform-opportunity",
    previewTitle: "Cloud Contact Centre Platform Opportunity",
    previewSummary:
      "A large organisation is seeking a cloud contact centre platform with implementation, security capability, and ongoing support.",
    buyerSector: "PRIVATE",
    mainCategory: "Technology & Communications",
    broadRegion: "South East England",
    valueBand: "£250k–£500k",
    deadlineBand: "Within 3 weeks",
    smeSuitability: "HIGH",
    bidComplexity: "MEDIUM",
    status: "OPEN",
  },
  closingPublic: {
    slug: "facilities-maintenance-framework-preview",
    previewTitle: "Facilities maintenance framework opportunity",
    previewSummary:
      "A public-sector estates function needs planned and reactive maintenance cover across a broad regional footprint.",
    buyerSector: "PUBLIC",
    mainCategory: "Facilities",
    broadRegion: "North of England",
    valueBand: "£1m–£5m",
    deadlineBand: "Closing soon",
    smeSuitability: "MEDIUM",
    bidComplexity: "HIGH",
    status: "CLOSING_SOON",
    matchScore: 72,
  },
} as const satisfies Record<string, DealCardData>;

export const DEAL_CARD_STORIES = [
  {
    id: "free-preview",
    name: "Free preview card",
    description: "Sanitised public/private preview with no source identity.",
    deal: DEAL_CARD_FIXTURES.freePreview,
  },
  {
    id: "match-score",
    name: "Preview with match score",
    description: "Optional relevance score when a company profile exists.",
    deal: DEAL_CARD_FIXTURES.closingPublic,
  },
] as const;

export const DEAL_PREVIEW_DETAIL_FIXTURE = {
  ...DEAL_CARD_FIXTURES.freePreview,
  dealType: "PRIVATE_TENDER",
  stage: "LIVE",
  durationBand: "3–5 years",
  competitionLevel: "MEDIUM",
  requirementsPreview: [
    "relevant implementation experience",
    "security/data-protection capability",
    "ongoing support capability",
    "evidence of comparable deployments",
  ],
  relevanceTags: ["cloud", "contact centre"],
  freshnessLabel: "Recently added",
} as const satisfies PublicDealPreview;

export const PROTECTED_FIELD_NAMES = [
  "buyerName",
  "buyer_name",
  "sourceUrl",
  "source_url",
  "sourceTitle",
  "source_title",
  "noticeId",
  "ocid",
  "contactEmail",
] as const;
