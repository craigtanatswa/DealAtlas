import { DEAL_CATEGORY_CATALOG } from "@/lib/matching/categories";

export type CategoryLanding = {
  slug: string;
  name: string;
  path: string;
  title: string;
  description: string;
  summary: string;
  body: string[];
  typicalBuyers: string;
  whatYouSeeFree: string;
};

const LANDINGS: Record<string, Omit<CategoryLanding, "slug" | "name" | "path">> = {
  technology: {
    title: "Technology opportunities",
    description:
      "DealAtlas opportunities for software, cloud, cyber, and digital delivery opportunities across UK public and private buyers.",
    summary:
      "Technology opportunities on DealAtlas cover systems, software, data, and digital services. Browse the commercial context first, then join Pro to unlock the buyer and original notice.",
    body: [
      "Suppliers often need to tell a software licence, a managed service, and a transformation programme apart before they spend time on a bid. DealAtlas groups those opportunities here so you can scan fit by value band, closing window, and SME suitability.",
      "The landing is curated. It is not a generated page for every keyword or filter combination. Filtered search URLs stay noindex so crawlers are not invited into infinite query combinations.",
    ],
    typicalBuyers:
      "Public bodies, utilities, healthcare, education, and private organisations buying digital capability.",
    whatYouSeeFree:
      "Category, broad region, value band, deadline band, and a summary of the work. Join DealAtlas Pro to unlock the buyer, original title, and source URL.",
  },
  "professional-services": {
    title: "Professional services opportunities",
    description:
      "DealAtlas opportunities for consultancy, advisory, audit, legal, and specialist professional services.",
    summary:
      "Professional services listings help firms see whether an engagement looks like retained advice, a discrete project, or a framework call-off. Join Pro to unlock who is buying.",
    body: [
      "Scan commercial bands and the type of engagement first, then open an opportunity when it looks like a fit.",
      "Use this page to understand the category, then join DealAtlas Pro when an opportunity is worth unlocking.",
    ],
    typicalBuyers:
      "Central and local public organisations, regulated industries, and private firms commissioning specialist advice.",
    whatYouSeeFree:
      "Scope, complexity, and closing window. Join DealAtlas Pro to unlock contacts, documents, and the original brief.",
  },
  "construction-infrastructure": {
    title: "Construction and infrastructure opportunities",
    description:
      "DealAtlas opportunities for construction, civils, and infrastructure delivery and maintenance.",
    summary:
      "Construction and infrastructure listings emphasise region, value band, and duration so you can judge fit before unlocking the source.",
    body: [
      "Use region, value, and duration to decide whether a construction or infrastructure opportunity is worth pursuing.",
      "This category landing is the curated entry point. It does not mass-publish a page per town, contractor, or scheme name.",
    ],
    typicalBuyers:
      "Public estates, infrastructure operators, utilities, and private developers procuring delivery partners.",
    whatYouSeeFree:
      "Broad region, value and duration bands, and high-level capability requirements. Join DealAtlas Pro to unlock the exact site, employer, and portal links.",
  },
  "facilities-property": {
    title: "Facilities and property opportunities",
    description:
      "DealAtlas opportunities for facilities management, estates, and property services.",
    summary:
      "Facilities and property opportunities are grouped here so suppliers can scan FM, maintenance, and estates work. Join Pro to unlock the occupier.",
    body: [
      "Building names and campus titles are often unique. Browse the type of work and commercial bands first, then unlock the occupier with Pro.",
      "Pro reveals the occupier, specification, and application path after entitlement is verified server-side.",
    ],
    typicalBuyers:
      "Public estates, healthcare and education campuses, and private landlords or occupiers.",
    whatYouSeeFree:
      "Category, region band, value band, and service scope. Join DealAtlas Pro to unlock occupier name and site list.",
  },
  healthcare: {
    title: "Healthcare opportunities",
    description:
      "DealAtlas opportunities for health, care, and life-science procurement.",
    summary:
      "Healthcare listings help a supplier judge clinical-adjacent or estates-adjacent fit. Join Pro to unlock the trust, board, or product name.",
    body: [
      "Use the summary, value band, and closing window to decide whether a healthcare opportunity is worth pursuing.",
      "This landing is the indexable category page. Search result combinations for healthcare filters are canonicalised away from the index.",
    ],
    typicalBuyers:
      "Health and care organisations and private providers buying services, supplies, or estates support.",
    whatYouSeeFree:
      "Clinical-adjacent or operational scope, value band, and closing window. Join DealAtlas Pro to unlock trust names and notice IDs.",
  },
  education: {
    title: "Education opportunities",
    description:
      "DealAtlas opportunities for schools, colleges, universities, and education-support procurement.",
    summary:
      "Education opportunities help a supplier see the type of work first. Join Pro to unlock the institution.",
    body: [
      "Use this landing to understand the category, then open an opportunity and join Pro when it is worth unlocking.",
      "There is no generated page per school or local authority. Those would be thin and unsafe.",
    ],
    typicalBuyers:
      "Education institutions and the public or private bodies that buy on their behalf.",
    whatYouSeeFree:
      "Requirement themes, region, and commercial bands. Join DealAtlas Pro to unlock the institution and portal.",
  },
  "transport-logistics": {
    title: "Transport and logistics opportunities",
    description:
      "DealAtlas opportunities for transport operations, fleet, logistics, and related infrastructure services.",
    summary:
      "Transport and logistics previews emphasise mode-agnostic commercial context rather than route, depot, or operator identity.",
    body: [
      "Use region and value bands, plus a summary of the work, to judge fit. Join Pro to unlock operator identity.",
      "Use this landing to understand the category; open a preview to assess fit; subscribe only when the opportunity is worth unlocking.",
    ],
    typicalBuyers:
      "Public transport authorities, infrastructure operators, and private logistics buyers.",
    whatYouSeeFree:
      "Broad geography, value band, and a summary of the service. Join DealAtlas Pro to unlock operator identity.",
  },
  "manufacturing-industrial": {
    title: "Manufacturing and industrial opportunities",
    description:
      "DealAtlas opportunities for manufacturing, industrial supply, and related engineering services.",
    summary:
      "Industrial listings help suppliers judge whether a requirement looks like components, plant, or ongoing supply. Join Pro to unlock the original specification title.",
    body: [
      "This category page explains the kind of industrial work you will see. Join Pro to unlock original specification titles.",
      "Filtered combinations such as region plus value band are available in search but are not indexed as separate landings.",
    ],
    typicalBuyers:
      "Public and private industrial buyers, utilities, and manufacturers procuring plant, parts, or production support.",
    whatYouSeeFree:
      "Category, region, value band, and capability needs. Join DealAtlas Pro to unlock OEM names and drawing references.",
  },
  "marketing-creative": {
    title: "Marketing and creative opportunities",
    description:
      "DealAtlas opportunities for marketing, communications, design, and creative services.",
    summary:
      "Creative and marketing listings describe the type of campaign or retained service. Join Pro to unlock the brand that is buying.",
    body: [
      "Scan campaign type and commercial bands first, then unlock the brand with DealAtlas Pro.",
      "This landing stays intentionally small: one useful page for the category, not a page per campaign slogan.",
    ],
    typicalBuyers:
      "Public communicators and private organisations buying campaigns, content, or retained creative support.",
    whatYouSeeFree:
      "Brief themes, value band, and closing window. Join DealAtlas Pro to unlock brand and agency-of-record identity.",
  },
  "food-catering": {
    title: "Food and catering opportunities",
    description:
      "DealAtlas opportunities for catering, food supply, and related hospitality services.",
    summary:
      "Food and catering listings show contract scale and region. Join Pro to unlock the venue, trust, or campus.",
    body: [
      "Judge whether an opportunity looks like retail, education catering, or wholesale supply, then unlock the venue with Pro.",
      "Suppliers can still judge whether an opportunity looks like retail, education catering, or wholesale supply.",
    ],
    typicalBuyers:
      "Education, health, workplace, and public venues plus private hospitality operators.",
    whatYouSeeFree:
      "Region, value band, duration band, and service type. Join DealAtlas Pro to unlock venue identity.",
  },
  "energy-utilities": {
    title: "Energy and utilities opportunities",
    description:
      "DealAtlas opportunities for energy, water, waste, and utilities procurement and supply-chain work.",
    summary:
      "Energy and utilities listings focus on the kind of asset or service. Join Pro to unlock the operator and scheme name.",
    body: [
      "Use this landing to understand the category, then join Pro when an energy or utilities opportunity is worth unlocking.",
      "This category landing is the curated entry point. It does not generate a page per GSP, treatment works, or licence area.",
    ],
    typicalBuyers:
      "Regulated utilities, public energy buyers, and private operators procuring assets or services.",
    whatYouSeeFree:
      "Asset or service theme, region, and commercial bands. Join DealAtlas Pro to unlock operator and scheme names.",
  },
  "office-business-supplies": {
    title: "Office and business supplies opportunities",
    description:
      "DealAtlas opportunities for office products, business supplies, and related managed supply.",
    summary:
      "Office and business-supply listings help distributors see scale and region. Join Pro to unlock the buyer.",
    body: [
      "Scan lot type and commercial bands first, then unlock the buyer and original title with DealAtlas Pro.",
      "Search filters remain available for users; they are not turned into extra indexable URLs.",
    ],
    typicalBuyers:
      "Public buying organisations and private workplaces consolidating supply contracts.",
    whatYouSeeFree:
      "Value band, region, and lot theme. Join DealAtlas Pro to unlock account name and portal.",
  },
};

export function indexableCategoryLandings(): CategoryLanding[] {
  return DEAL_CATEGORY_CATALOG.filter((item) => item.slug !== "other").map(
    (item) => {
      const copy = LANDINGS[item.slug];
      if (!copy) {
        throw new Error(`Missing category landing copy for ${item.slug}`);
      }
      return {
        slug: item.slug,
        name: item.name,
        path: `/categories/${item.slug}`,
        ...copy,
      };
    },
  );
}

export function getCategoryLanding(slug: string): CategoryLanding | null {
  return indexableCategoryLandings().find((item) => item.slug === slug) ?? null;
}

export function isIndexableCategorySlug(slug: string): boolean {
  return getCategoryLanding(slug) !== null;
}
