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
      "Sanitised DealAtlas previews for software, cloud, cyber, and digital delivery opportunities across UK public and private buyers.",
    summary:
      "Technology opportunities on DealAtlas cover systems, software, data, and digital services. Free pages show an anonymised title, summary, and commercial bands — not the buyer or original notice.",
    body: [
      "Suppliers often need to tell a software licence, a managed service, and a transformation programme apart before they spend time on a bid. DealAtlas groups those sanitised previews here so you can scan fit by value band, closing window, and SME suitability.",
      "The landing is curated. It is not a generated page for every keyword or filter combination. Filtered search URLs stay noindex so crawlers are not invited into infinite query combinations.",
    ],
    typicalBuyers:
      "Public bodies, utilities, healthcare, education, and private organisations buying digital capability.",
    whatYouSeeFree:
      "Category, broad region, value band, deadline band, and a paraphrased summary. Buyer name, source title, and source URL stay locked until Pro is verified.",
  },
  "professional-services": {
    title: "Professional services opportunities",
    description:
      "Sanitised DealAtlas previews for consultancy, advisory, audit, legal, and specialist professional services.",
    summary:
      "Professional services previews help firms see whether an engagement looks like retained advice, a discrete project, or a framework call-off — without revealing who is buying.",
    body: [
      "Advisory work is easy to reverse-search if the original title and buyer leak into a public page. DealAtlas therefore publishes only paraphrased previews with commercial bands.",
      "Use this page to understand the category, then open individual sanitised deals or start a Pro trial when a preview is worth pursuing.",
    ],
    typicalBuyers:
      "Central and local public organisations, regulated industries, and private firms commissioning specialist advice.",
    whatYouSeeFree:
      "Anonymised scope, complexity, and closing window. Contacts, documents, and the original brief remain behind entitlement.",
  },
  "construction-infrastructure": {
    title: "Construction and infrastructure opportunities",
    description:
      "Sanitised DealAtlas previews for construction, civils, and infrastructure delivery and maintenance.",
    summary:
      "Construction and infrastructure previews emphasise region, value band, and duration rather than site-level identity that would make the source trivial to find.",
    body: [
      "Exact addresses, plot names, and scheme titles are common reverse-lookup keys. Free DealAtlas pages keep location at a broad UK region and rewrite the title so the original notice is not sitting in metadata.",
      "This category landing explains that policy. It does not mass-publish a page per town, contractor, or scheme name.",
    ],
    typicalBuyers:
      "Public estates, infrastructure operators, utilities, and private developers procuring delivery partners.",
    whatYouSeeFree:
      "Broad region, value and duration bands, and high-level capability requirements. Exact site, employer, and portal links stay locked.",
  },
  "facilities-property": {
    title: "Facilities and property opportunities",
    description:
      "Sanitised DealAtlas previews for facilities management, estates, and property services.",
    summary:
      "Facilities and property opportunities are grouped here so suppliers can scan sanitised FM, maintenance, and estates work without seeing the occupier’s identity.",
    body: [
      "Building names and campus titles often identify the buyer on their own. DealAtlas previews generalise those details and keep the public page useful without handing over the source.",
      "Pro reveals the occupier, specification, and application path after entitlement is verified server-side.",
    ],
    typicalBuyers:
      "Public estates, healthcare and education campuses, and private landlords or occupiers.",
    whatYouSeeFree:
      "Category, region band, value band, and paraphrased service scope. Occupier name and site list remain protected.",
  },
  healthcare: {
    title: "Healthcare opportunities",
    description:
      "Sanitised DealAtlas previews for health, care, and life-science procurement that can be shown without identifying the buyer.",
    summary:
      "Healthcare previews on DealAtlas are written so a supplier can judge clinical-adjacent or estates-adjacent fit without a trust, board, or product name in the public page.",
    body: [
      "Health procurement pages are frequently unique enough that an exact title is a lookup key. Free metadata therefore uses only the DealAtlas preview title and summary.",
      "This landing is the indexable category page. Search result combinations for healthcare filters are canonicalised away from the index.",
    ],
    typicalBuyers:
      "Health and care organisations and private providers buying services, supplies, or estates support.",
    whatYouSeeFree:
      "Sanitised clinical-adjacent or operational scope, value band, and closing window. Trust names and notice IDs are not present.",
  },
  education: {
    title: "Education opportunities",
    description:
      "Sanitised DealAtlas previews for schools, colleges, universities, and education-support procurement.",
    summary:
      "Education opportunities are shown as anonymised previews so a supplier can see the type of work without the institution appearing in Google results.",
    body: [
      "Institution names in titles make reverse lookup trivial. DealAtlas keeps education landings useful by describing the category and linking only to sanitised deal_previews.",
      "There is no generated page per school or local authority. Those would be thin and unsafe.",
    ],
    typicalBuyers:
      "Education institutions and the public or private bodies that buy on their behalf.",
    whatYouSeeFree:
      "Paraphrased requirement themes, region, and commercial bands. The institution and portal stay locked.",
  },
  "transport-logistics": {
    title: "Transport and logistics opportunities",
    description:
      "Sanitised DealAtlas previews for transport operations, fleet, logistics, and related infrastructure services.",
    summary:
      "Transport and logistics previews emphasise mode-agnostic commercial context rather than route, depot, or operator identity.",
    body: [
      "Route numbers and depot names identify buyers quickly. Free pages therefore stay at region and value bands, with a paraphrased summary of the work.",
      "Use this landing to understand the category; open a preview to assess fit; subscribe only when the opportunity is worth unlocking.",
    ],
    typicalBuyers:
      "Public transport authorities, infrastructure operators, and private logistics buyers.",
    whatYouSeeFree:
      "Broad geography, value band, and sanitised service description. Operator identity is Pro-only.",
  },
  "manufacturing-industrial": {
    title: "Manufacturing and industrial opportunities",
    description:
      "Sanitised DealAtlas previews for manufacturing, industrial supply, and related engineering services.",
    summary:
      "Industrial previews help suppliers judge whether a requirement looks like components, plant, or ongoing supply without exposing the original specification title.",
    body: [
      "Part numbers and plant names can be unique identifiers. DealAtlas public pages do not reprint them. This category page explains the kind of work you will see in sanitised form.",
      "Filtered combinations such as region plus value band are available in search but are not indexed as separate landings.",
    ],
    typicalBuyers:
      "Public and private industrial buyers, utilities, and manufacturers procuring plant, parts, or production support.",
    whatYouSeeFree:
      "Category, region, value band, and paraphrased capability needs. OEM names and drawing references stay locked.",
  },
  "marketing-creative": {
    title: "Marketing and creative opportunities",
    description:
      "Sanitised DealAtlas previews for marketing, communications, design, and creative services.",
    summary:
      "Creative and marketing previews describe the type of campaign or retained service without naming the brand that is buying.",
    body: [
      "Brand names in a tender title are themselves the leak. DealAtlas rewrites those titles before a preview can be published or indexed.",
      "This landing stays intentionally small: one useful page for the category, not a page per campaign slogan.",
    ],
    typicalBuyers:
      "Public communicators and private organisations buying campaigns, content, or retained creative support.",
    whatYouSeeFree:
      "Sanitised brief themes, value band, and closing window. Brand and agency-of-record identity remain protected.",
  },
  "food-catering": {
    title: "Food and catering opportunities",
    description:
      "Sanitised DealAtlas previews for catering, food supply, and related hospitality services.",
    summary:
      "Food and catering previews show contract scale and region without naming the venue, trust, or campus being fed.",
    body: [
      "Venue names identify buyers immediately. Free DealAtlas pages keep the buyer anonymous and the original menu specification off the public HTML and metadata.",
      "Suppliers can still judge whether an opportunity looks like retail, education catering, or wholesale supply.",
    ],
    typicalBuyers:
      "Education, health, workplace, and public venues plus private hospitality operators.",
    whatYouSeeFree:
      "Region, value band, duration band, and paraphrased service type. Venue identity stays locked.",
  },
  "energy-utilities": {
    title: "Energy and utilities opportunities",
    description:
      "Sanitised DealAtlas previews for energy, water, waste, and utilities procurement and supply-chain work.",
    summary:
      "Energy and utilities previews focus on the kind of asset or service, not the network operator’s identity or the scheme’s public name.",
    body: [
      "Named programmes and grid references are common lookup keys. DealAtlas only indexes sanitised previews that survive leak scanning.",
      "This category landing is the curated entry point. It does not generate a page per GSP, treatment works, or licence area.",
    ],
    typicalBuyers:
      "Regulated utilities, public energy buyers, and private operators procuring assets or services.",
    whatYouSeeFree:
      "Sanitised asset or service theme, region, and commercial bands. Operator and scheme names remain Pro-only.",
  },
  "office-business-supplies": {
    title: "Office and business supplies opportunities",
    description:
      "Sanitised DealAtlas previews for office products, business supplies, and related managed supply.",
    summary:
      "Office and business-supply previews help distributors see scale and region without a catalogue of the buyer’s identity.",
    body: [
      "Framework lots for stationery and workplace supply are often easy to find once the buyer is named. Free pages therefore keep the buyer locked and the title paraphrased.",
      "Search filters remain available for users; they are not turned into extra indexable URLs.",
    ],
    typicalBuyers:
      "Public buying organisations and private workplaces consolidating supply contracts.",
    whatYouSeeFree:
      "Value band, region, and sanitised lot theme. Account name and portal remain protected.",
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
