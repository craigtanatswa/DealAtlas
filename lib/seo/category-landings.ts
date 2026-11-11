import { mapRawCategoryToFilter } from "@/lib/categories/filter-map";
import { DEAL_CATEGORY_CATALOG } from "@/lib/matching/categories";

export type CategoryLanding = {
  slug: string;
  name: string;
  path: string;
  title: string;
  description: string;
  h1?: string;
  summary: string;
  body: string[];
  typicalBuyers: string;
  whatYouSeeFree: string;
  guide?: { href: string; anchor: string };
  subsection?: {
    id: string;
    heading: string;
    intro: string;
    query: string;
    minCards: number;
  };
};

const LANDINGS: Record<string, Omit<CategoryLanding, "slug" | "name" | "path">> = {
  technology: {
    title: "IT tenders UK: software, cyber and digital contracts",
    description:
      "Live IT tenders UK: software, cyber security, managed IT and digital contracts, listed by region and value band on DealAtlas.",
    h1: "IT tenders in the UK",
    summary:
      "IT tenders UK for software, cyber security, managed IT, data platforms and digital services are grouped on this page. Browse value band, region and closing window first, then open a preview when it looks like a fit.",
    body: [
      "UK public buyers tender for software, websites, managed IT, data platforms and cyber security all year round. This page is the DealAtlas list of live Technology opportunities. Each preview is sanitised: you see the type of work, region, value band and closing window, not the buyer.",
      "Use the cards below to browse live IT tenders, or read the IT tenders UK guide for how this work is bought. This is the indexable Technology landing. Filtered search URLs are not indexed, and we do not publish a page per product, programme or keyword combination.",
    ],
    typicalBuyers:
      "Public bodies, utilities, healthcare, education, and private organisations buying digital capability.",
    whatYouSeeFree:
      "Category, broad region, value band, deadline band, and a summary of the work. Join DealAtlas Pro to unlock the buyer, original title, and source URL.",
    guide: {
      href: "/guides/it-tenders-uk",
      anchor: "IT tenders UK guide",
    },
  },
  "professional-services": {
    title: "Architecture, engineering and professional services tenders UK",
    description:
      "Architecture, engineering and professional services tenders UK: design, inspection, consultancy, audit and legal contracts, by region and value band on DealAtlas.",
    h1: "Architecture, engineering and professional services tenders in the UK",
    summary:
      "Architecture, engineering and professional services tenders UK are listed here, covering design and inspection work as well as consultancy, audit, legal and other specialist advice. Scan the type of engagement, region and value band first, then open a preview when it looks like a fit.",
    body: [
      "A large share of the live previews in this category are architectural, engineering and inspection services, alongside retained advice, discrete projects and framework call-offs. This page is the DealAtlas list for that mix. Each preview shows a sanitised title, region, value band and closing window.",
      "Architecture and engineering tenders are grouped in the section below when enough live previews exist. For audit, insurance and financial advice, see the financial services tenders UK guide. This is the indexable professional-services landing; filtered search URLs are not indexed.",
    ],
    typicalBuyers:
      "Central and local public organisations, regulated industries, and private firms commissioning specialist advice.",
    whatYouSeeFree:
      "Scope, complexity, and closing window. Join DealAtlas Pro to unlock contacts, documents, and the original brief.",
    guide: {
      href: "/guides/financial-services-tenders-uk",
      anchor: "financial services tenders UK guide",
    },
    subsection: {
      id: "architecture-engineering",
      heading: "Architecture and engineering tenders",
      intro:
        "These are open architecture and engineering tenders on DealAtlas, listed with a sanitised title, region, value band and closing window.",
      query: "architectural or engineering",
      minCards: 5,
    },
  },
  "construction-infrastructure": {
    title: "Construction tenders UK: open public construction bids",
    description:
      "Open construction tenders UK and public construction bids for building, civils, repair and infrastructure, by region and value band on DealAtlas.",
    h1: "Construction tenders in the UK",
    summary:
      "Construction tenders UK are listed here as open public construction bids for building, civil engineering, repair, installation and infrastructure work. Scan region, value band and closing window first, then open a preview when it looks like a fit.",
    body: [
      "UK public buyers put construction work out to tender every week, from small repair packages to multi-year infrastructure programmes. This page is the DealAtlas list of live construction and infrastructure opportunities. Each preview shows a sanitised title, region, value band and closing window, so you can judge fit before unlocking the buyer and documents.",
      "Use the cards below to browse open construction bids, or read the construction tenders UK guide for how this work is bought and how to filter it by type of work and region. This is the indexable construction landing. Filtered search URLs are not indexed, and we do not publish a page per town, contractor or scheme.",
    ],
    typicalBuyers:
      "Public estates, infrastructure operators, utilities, and private developers procuring delivery partners.",
    whatYouSeeFree:
      "Broad region, value and duration bands, and high-level capability requirements. Join DealAtlas Pro to unlock the buyer, the specification and how to apply.",
    guide: {
      href: "/guides/construction-tenders-uk",
      anchor: "construction tenders UK guide",
    },
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
    guide: {
      href: "/guides/transport-logistics-tenders-uk",
      anchor: "transport and logistics tenders UK guide",
    },
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

export function categoryLandingForRawCategory(
  raw: string | null | undefined,
): CategoryLanding | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  const landings = indexableCategoryLandings();
  const exact = landings.find(
    (landing) =>
      landing.name.toLowerCase() === trimmed.toLowerCase() ||
      landing.slug.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exact) {
    return exact;
  }

  const filterName = mapRawCategoryToFilter(trimmed);
  if (!filterName) {
    return null;
  }

  return landings.find((landing) => landing.name === filterName) ?? null;
}
