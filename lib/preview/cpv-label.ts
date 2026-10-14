import { leakTokens } from "@/lib/redaction/gate-normalize";

/**
 * Official CPV division titles (2-digit). Free previews use these as the
 * sector phrase and never the 8-digit code.
 */
const CPV_DIVISION: Record<string, string> = {
  "03": "Agricultural, farming, fishing and forestry products",
  "09": "Petroleum, fuel, electricity and other energy",
  "14": "Mining, basic metals and related products",
  "15": "Food, beverages, tobacco and related products",
  "16": "Agricultural machinery",
  "18": "Clothing, footwear, luggage and accessories",
  "19": "Leather, textile, plastic and rubber materials",
  "22": "Printed matter and related products",
  "24": "Chemical products",
  "30": "Office and computing machinery and supplies",
  "31": "Electrical machinery, apparatus and lighting",
  "32": "Communications and telecommunications equipment",
  "33": "Medical equipment, pharmaceuticals and personal care",
  "34": "Transport equipment",
  "35": "Security, fire-fighting and defence equipment",
  "37": "Musical instruments, sports goods, games and toys",
  "38": "Laboratory, optical and precision equipment",
  "39": "Furniture, furnishings, domestic appliances and cleaning products",
  "41": "Collected and purified water",
  "42": "Industrial machinery",
  "43": "Mining, quarrying and construction machinery",
  "44": "Construction structures and materials",
  "45": "Construction work",
  "48": "Software packages and information systems",
  "50": "Repair and maintenance services",
  "51": "Installation services",
  "55": "Hotel, restaurant and retail services",
  "60": "Transport services",
  "63": "Supporting transport and travel-agency services",
  "64": "Postal and telecommunications services",
  "65": "Public utilities",
  "66": "Financial and insurance services",
  "70": "Real estate services",
  "71": "Architectural, engineering and inspection services",
  "72": "IT services: consulting, software development, Internet and support",
  "73": "Research and development services",
  "75": "Administration, defence and social security services",
  "76": "Oil and gas industry services",
  "77": "Agricultural, forestry and horticultural services",
  "79": "Business services: law, marketing, consulting, recruitment and security",
  "80": "Education and training services",
  "85": "Health and social work services",
  "90": "Sewage, refuse, cleaning and environmental services",
  "92": "Recreational, cultural and sporting services",
  "98": "Other community, social and personal services",
};

/** Group titles (3-digit) used when a notice code is finer than the division. */
const CPV_GROUP: Record<string, string> = {
  "451": "Site preparation work",
  "452": "Works for complete or part construction and civil engineering",
  "453": "Building installation work",
  "454": "Building completion work",
  "455": "Hire of construction machinery with an operator",
  "720": "IT services: consulting, software development, Internet and support",
  "721": "Hardware consultancy services",
  "722": "Software programming and consultancy services",
  "723": "Data services",
  "724": "Internet services",
  "725": "Computer-related services",
  "726": "Computer support and consultancy services",
  "909": "Cleaning and sanitation services",
  "851": "Health services",
  "796": "Recruitment services",
  "805": "Training services",
};

const MAX_DESCRIPTION_WORDS = 8;

function digits(code: string | null | undefined): string {
  return (code ?? "").replace(/\D/g, "");
}

/** Drop 8-digit CPV codes and a trailing check digit. Descriptions stay. */
export function stripCpvCodes(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const cleaned = value
    .replace(/\bcpv\b/gi, " ")
    .replace(/\b\d{8}(?:-\d)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-:;,.\s]+|[-:;,.\s]+$/g, "");
  if (!cleaned || /\b\d{8}\b/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export function cpvDivisionLabel(code: string | null | undefined): string | null {
  const key = digits(code).slice(0, 2);
  return CPV_DIVISION[key] ?? null;
}

export function cpvGroupLabel(code: string | null | undefined): string | null {
  const key = digits(code).slice(0, 3);
  return CPV_GROUP[key] ?? null;
}

/**
 * Goods phrase for a free preview. A short official description is kept
 * (division/group style, for example "Construction work for hospital
 * facilities"). Longer leaf text rolls up to the group, then the division.
 * The 8-digit code is never returned.
 */
export function cpvGoodsLabel(
  code: string | null | undefined,
  description: string | null | undefined,
): string | null {
  const text = stripCpvCodes(description);
  const significant = digits(code).replace(/0+$/, "");
  if (text && leakTokens(text).length <= MAX_DESCRIPTION_WORDS) {
    if (significant.length <= 3 || leakTokens(text).length <= 6) {
      return text;
    }
  }
  return cpvGroupLabel(code) ?? cpvDivisionLabel(code) ?? text;
}
