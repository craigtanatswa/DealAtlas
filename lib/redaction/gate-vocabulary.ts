/**
 * Vocabulary shared by the TypeScript preview scanner and the database publish
 * gate (`private.leak_gate_terms`, migration 0018). The pgTAP parity suite is
 * generated from these lists, so a change here without a matching migration
 * fails `supabase/tests/database/leak_gate_parity.test.sql`.
 *
 * Terms are lowercase except `generic_acronym`, which is matched against
 * uppercase tokens.
 */

/** Words that never make an organisation, project or place name distinctive. */
export const GENERIC_ORG_TOKENS = [
  "academies", "academy", "agency", "ambulance", "and", "association", "authorities",
  "authority", "board", "borough", "britain", "british", "care", "central", "cic",
  "city", "college", "combined", "commercial", "commission", "commissioner", "community",
  "companies", "company", "construction", "consulting", "contractors", "corporation",
  "council", "councils", "county", "crown", "department", "dept", "development",
  "district", "east", "eastern", "education", "electricity", "energy", "engineering",
  "england", "english", "enterprises", "estates", "executive", "facilities", "fire",
  "for", "foundation", "gas", "global", "government", "greater", "group", "groups",
  "health", "healthcare", "highways", "holdings", "homes", "hospital", "hospitals",
  "housing", "industries", "infrastructure", "integrated", "international", "ireland",
  "kingdom", "limited", "llc", "llp", "local", "lower", "ltd", "majesty", "majestys",
  "management", "metropolitan", "ministry", "national", "network", "networks", "new",
  "nhs", "north", "northern", "office", "parish", "partners", "partnership", "plc",
  "police", "power", "private", "property", "public", "rail", "railway", "railways",
  "regional", "rescue", "road", "roads", "royal", "school", "schools", "scotland",
  "scottish", "service", "services", "solutions", "south", "southern", "support",
  "system", "systems", "technologies", "technology", "the", "town", "trading",
  "transport", "trust", "trusts", "united", "university", "upper", "utilities",
  "ventures", "wales", "water", "welsh", "west", "western", "with",
] as const;

/** Uppercase tokens that are generic procurement/technical vocabulary. */
export const GENERIC_ACRONYMS = [
  "A&E", "AED", "ANPR", "API", "APIS", "ASB", "AWS", "BCP", "BIM", "BMS", "BREEAM",
  "BSI", "BTEC", "CAD", "CCTV", "CDM", "CHAS", "CMS", "CNC", "CO2", "COSHH", "COVID",
  "COVID19", "CPD", "CPV", "CQC", "CRM", "CSCS", "CSR", "DBS", "DDA", "DFMA", "DPIA",
  "DPS", "EHCP", "EHR", "EOI", "EPC", "EPR", "ERP", "ESG", "ESOL", "EVCP", "EVS",
  "FOI", "GBP", "GCSE", "GDPR", "GIS", "GPS", "HGV", "HSCN", "HVAC", "IAAS", "IAM",
  "ICT", "ICU", "IOT", "IR35", "ISO", "ITT", "JCT", "KPI", "KPIS", "LAN", "LED", "LGV",
  "LIMS", "LOLER", "LPG", "M&E", "MEP", "MEWP", "MFA", "MMC", "MOT", "MPLS", "MRI",
  "NEC", "NHS", "NVQ", "OEM", "PAAS", "PACS", "PAS", "PAT", "PCR", "PFI", "PM10",
  "PPE", "PQQ", "PSN", "PSTN", "R&D", "RFI", "RFP", "RFQ", "RIDDOR", "SAAS", "SCADA",
  "SEN", "SEND", "SIEM", "SIP", "SLA", "SLAS", "SME", "SMES", "SOC", "SQL", "SSIP",
  "SSO", "STEM", "TUPE", "UAT", "UKAS", "UPS", "VAT", "VCSE", "VOIP", "VPN", "WAN",
  "WIFI",
] as const;

/** Title-Case words allowed in prose runs (regions, months, generic schemes). */
export const GENERIC_PROPER_WORDS = [
  "act", "amazon", "and", "april", "august", "britain", "british", "building",
  "contracts", "cyber", "data", "december", "east", "england", "english",
  "essentials", "european", "february", "friday", "google", "great", "health",
  "humber", "ireland", "january", "july", "june", "kingdom", "living", "london",
  "march", "may", "microsoft", "midlands", "modern", "monday", "nationwide", "net",
  "north", "northern", "november", "october", "of", "office", "plus", "private",
  "procurement", "protection", "public", "real", "regulations", "remote",
  "safety", "saturday", "scotland", "scottish", "sector", "september",
  "slavery", "social", "south", "sunday", "the", "thursday", "tuesday", "union",
  "united", "value", "wage", "wales", "wednesday", "welsh", "west", "workspace",
  "yorkshire", "zero",
] as const;

/** Location strings that are coarse enough to appear in a free preview. */
export const BROAD_LOCATION_TERMS = [
  "britain", "east", "east midlands", "east of england", "england", "europe", "gb",
  "great britain", "ireland", "london", "midlands", "nationwide", "north",
  "north east", "north east england", "north west", "north west england",
  "northern ireland", "remote", "scotland", "south", "south east",
  "south east england", "south west", "south west england", "uk", "united kingdom",
  "wales", "west", "west midlands", "yorkshire and the humber",
] as const;

/** Prefixes of standards/product codes that look like references but are not. */
export const REFERENCE_PREFIX_ALLOWLIST = [
  "bs", "bsen", "en", "g", "hbn", "htm", "iec", "ipv", "iso", "jct", "lot", "m",
  "nec", "office", "pas", "phase", "shtm", "tier", "year",
] as const;

/** Uppercase tokens shaped like a postcode outward half that are not places. */
export const POSTCODE_LIKE_ALLOWLIST = [
  "A3", "A4", "A5", "B2B", "B2C", "B2G", "CO2", "E2E", "G2G", "H2", "H2O", "IR35",
  "KS1", "KS2", "KS3", "KS4", "KS5", "NO2", "P2P", "PM10", "SO2",
] as const;

/** Function words ignored when deciding if a copied phrase is distinctive. */
export const PHRASE_STOPWORDS = [
  "a", "across", "all", "also", "an", "and", "any", "are", "as", "at", "be", "been",
  "being", "by", "can", "contract", "contracts", "could", "delivery", "for",
  "framework", "from", "has", "have", "in", "include", "including", "into", "is",
  "it", "its", "may", "must", "no", "not", "of", "on", "opportunity", "or", "other",
  "our", "over", "per", "provision", "requirement", "requirements", "service",
  "services", "should", "such", "supply", "tender", "that", "the", "their", "these",
  "this", "those", "to", "under", "up", "was", "we", "were", "which", "who", "will",
  "with", "within", "would", "you",
] as const;

export const SOURCE_PLATFORM_MARKERS = [
  "contracts finder",
  "contractsfinder",
  "crown commercial service",
  "e-tenders ni",
  "etendersni",
  "find a tender",
  "find-a-tender",
  "find-tender",
  "nista",
  "public contracts scotland",
  "sell2wales",
  "ted.europa.eu",
  "tenders electronic daily",
  "uk infrastructure pipeline",
] as const;

export type LeakGateTermKind =
  | "generic_org_token"
  | "generic_acronym"
  | "generic_proper_word"
  | "broad_location"
  | "reference_prefix"
  | "postcode_like"
  | "phrase_stopword"
  | "source_platform";

export const LEAK_GATE_TERMS: Record<LeakGateTermKind, readonly string[]> = {
  generic_org_token: GENERIC_ORG_TOKENS,
  generic_acronym: GENERIC_ACRONYMS,
  generic_proper_word: GENERIC_PROPER_WORDS,
  broad_location: BROAD_LOCATION_TERMS,
  reference_prefix: REFERENCE_PREFIX_ALLOWLIST,
  postcode_like: POSTCODE_LIKE_ALLOWLIST,
  phrase_stopword: PHRASE_STOPWORDS,
  source_platform: SOURCE_PLATFORM_MARKERS,
};
