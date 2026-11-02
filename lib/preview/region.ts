const NUTS1_REGIONS: Record<string, string> = {
  UKC: "North East England",
  UKD: "North West England",
  UKE: "Yorkshire and the Humber",
  UKF: "East Midlands",
  UKG: "West Midlands",
  UKH: "East of England",
  UKI: "London",
  UKJ: "South East England",
  UKK: "South West England",
  UKL: "Wales",
  UKM: "Scotland",
  UKN: "Northern Ireland",
};

const CITY_REGIONS: Array<{ pattern: RegExp; region: string }> = [
  { pattern: /\b(manchester|salford|bolton|oldham|stockport|wigan|liverpool|preston)\b/i, region: "North West England" },
  { pattern: /\b(newcastle|sunderland|durham|middlesbrough|gateshead)\b/i, region: "North East England" },
  { pattern: /\b(leeds|sheffield|bradford|york|hull|wakefield|doncaster)\b/i, region: "Yorkshire and the Humber" },
  { pattern: /\b(nottingham|leicester|derby|lincoln|northampton)\b/i, region: "East Midlands" },
  { pattern: /\b(birmingham|coventry|wolverhampton|stoke|worcester)\b/i, region: "West Midlands" },
  { pattern: /\b(cambridge|norwich|ipswich|luton|peterborough|suffolk|norfolk|essex)\b/i, region: "East of England" },
  { pattern: /\b(london|westminster|southwark|camden|islington|croydon|barnet)\b/i, region: "London" },
  { pattern: /\b(brighton|reading|oxford|southampton|portsmouth|kent|surrey)\b/i, region: "South East England" },
  { pattern: /\b(bristol|plymouth|exeter|bournemouth|swindon|cornwall|devon)\b/i, region: "South West England" },
  { pattern: /\b(cardiff|swansea|newport|wrexham|bangor)\b/i, region: "Wales" },
  { pattern: /\b(glasgow|edinburgh|aberdeen|dundee|inverness|scotland)\b/i, region: "Scotland" },
  { pattern: /\b(belfast|derry|londonderry|lisburn|northern ireland)\b/i, region: "Northern Ireland" },
];

const POSTCODE_AREA_REGIONS: Record<string, string> = {
  M: "North West England",
  L: "North West England",
  PR: "North West England",
  BL: "North West England",
  WA: "North West England",
  CH: "North West England",
  CA: "North West England",
  NE: "North East England",
  SR: "North East England",
  DH: "North East England",
  TS: "North East England",
  LS: "Yorkshire and the Humber",
  S: "Yorkshire and the Humber",
  BD: "Yorkshire and the Humber",
  HU: "Yorkshire and the Humber",
  YO: "Yorkshire and the Humber",
  NG: "East Midlands",
  LE: "East Midlands",
  DE: "East Midlands",
  LN: "East Midlands",
  NN: "East Midlands",
  B: "West Midlands",
  CV: "West Midlands",
  WV: "West Midlands",
  ST: "West Midlands",
  WR: "West Midlands",
  CB: "East of England",
  NR: "East of England",
  IP: "East of England",
  LU: "East of England",
  PE: "East of England",
  CM: "East of England",
  SS: "East of England",
  AL: "East of England",
  E: "London",
  EC: "London",
  N: "London",
  NW: "London",
  SE: "London",
  SW: "London",
  W: "London",
  WC: "London",
  BR: "London",
  CR: "London",
  HA: "London",
  IG: "London",
  KT: "London",
  RM: "London",
  SM: "London",
  TW: "London",
  UB: "London",
  WD: "London",
  BN: "South East England",
  RG: "South East England",
  OX: "South East England",
  SO: "South East England",
  PO: "South East England",
  ME: "South East England",
  TN: "South East England",
  GU: "South East England",
  SL: "South East England",
  HP: "South East England",
  RH: "South East England",
  BS: "South West England",
  PL: "South West England",
  EX: "South West England",
  BH: "South West England",
  SN: "South West England",
  TA: "South West England",
  TR: "South West England",
  GL: "South West England",
  CF: "Wales",
  SA: "Wales",
  NP: "Wales",
  LL: "Wales",
  G: "Scotland",
  EH: "Scotland",
  AB: "Scotland",
  DD: "Scotland",
  IV: "Scotland",
  KY: "Scotland",
  PA: "Scotland",
  FK: "Scotland",
  ML: "Scotland",
  BT: "Northern Ireland",
};

export const BROAD_REGIONS = [
  "Nationwide",
  "London",
  "South East England",
  "South West England",
  "East of England",
  "East Midlands",
  "West Midlands",
  "Yorkshire and the Humber",
  "North West England",
  "North East England",
  "Scotland",
  "Wales",
  "Northern Ireland",
  "Remote",
] as const;

export type BroadRegion = (typeof BROAD_REGIONS)[number];

function nutsRegion(value: string): BroadRegion | null {
  const code = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length < 3) {
    return null;
  }
  const mapped = NUTS1_REGIONS[code.slice(0, 3)];
  return (mapped as BroadRegion | undefined) ?? null;
}

function postcodeRegion(value: string): BroadRegion | null {
  const match = value.toUpperCase().match(/\b([A-Z]{1,2})\d/);
  if (!match) {
    return null;
  }
  const area = match[1];
  if (!area) {
    return null;
  }
  return (POSTCODE_AREA_REGIONS[area] as BroadRegion | undefined) ?? null;
}

export function broadRegionFromLocation(
  parts: Array<string | null | undefined>,
): BroadRegion | null {
  const blob = parts.filter(Boolean).join(" ").trim();
  if (!blob) {
    return null;
  }

  for (const [code, region] of Object.entries(NUTS1_REGIONS)) {
    if (new RegExp(`\\b${code}\\d*\\b`, "i").test(blob)) {
      return region as BroadRegion;
    }
  }

  for (const entry of CITY_REGIONS) {
    if (entry.pattern.test(blob)) {
      return entry.region as BroadRegion;
    }
  }

  const fromPostcode = postcodeRegion(blob);
  if (fromPostcode) {
    return fromPostcode;
  }

  const lowered = blob.toLowerCase();
  for (const region of BROAD_REGIONS) {
    if (region !== "Nationwide" && region !== "Remote" && lowered.includes(region.toLowerCase())) {
      return region;
    }
  }

  if (/\bremote\b/i.test(blob) && !/\b(england|scotland|wales|ireland|london)\b/i.test(blob)) {
    return "Remote";
  }
  if (/\b(nationwide|national|united kingdom|\buk\b|\bgb\b)\b/i.test(blob)) {
    return "Nationwide";
  }

  return nutsRegion(blob);
}

const NUTS1_WORD =
  /^(britain|england|scotland|wales|london|ireland|northern|east|west|north|south|midlands|yorkshire|humber|nationwide|remote|kingdom|united)$/;

/** True for a place name finer than NUTS1. NUTS1 words themselves are kept. */
export function isBelowNuts1Place(word: string): boolean {
  const token = word.toLowerCase();
  if (!token || NUTS1_WORD.test(token)) {
    return false;
  }
  return CITY_REGIONS.some((entry) => entry.pattern.test(token));
}

/**
 * Country-level regions for European notices (TED). Mapped from the ISO
 * 3166-1 alpha-2 code only; nothing finer than the country is ever shown.
 */
export const COUNTRY_REGIONS: Record<string, string> = {
  AT: "Austria",
  BE: "Belgium",
  BG: "Bulgaria",
  HR: "Croatia",
  CY: "Cyprus",
  CZ: "Czechia",
  DK: "Denmark",
  EE: "Estonia",
  FI: "Finland",
  FR: "France",
  DE: "Germany",
  GR: "Greece",
  EL: "Greece",
  HU: "Hungary",
  IE: "Ireland",
  IT: "Italy",
  LV: "Latvia",
  LT: "Lithuania",
  LU: "Luxembourg",
  MT: "Malta",
  NL: "Netherlands",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  SK: "Slovakia",
  SI: "Slovenia",
  ES: "Spain",
  SE: "Sweden",
  IS: "Iceland",
  LI: "Liechtenstein",
  NO: "Norway",
  CH: "Switzerland",
};

export const EUROPE_OTHER = "Europe (other)";

// Anti-bypass: a country with few open notices would let a free user narrow a search to
// one or two deals. Bucketed: LI, IS, MT, LU, CY (always) plus every country with <=5 open TED notices in prod on
// 2026-11-02 (open notices by buyer country: PT 1, RO 1, AT 2, SK 2, IT 3, GR 3, LT 4, HR 4, PL 5, CY 5; BG, HU, IS,
// LI, NO, CH 0; MT 50 and LU 10 bucketed regardless). Named countries that day: SI 6, CZ 7, FR 7, LV 8, DK 8, FI 8,
// NL 10, EE 12, SE 20, DE 24, BE 26, ES 33, IE 140. Revisit by hand; never compute at runtime.
export const LOW_VOLUME_COUNTRIES = new Set([
  "AT", "BG", "CH", "CY", "EL", "GR", "HR", "HU", "IS", "IT",
  "LI", "LT", "LU", "MT", "NO", "PL", "PT", "RO", "SK",
]);

export const COUNTRY_REGION_NAMES = [
  ...new Set(
    Object.entries(COUNTRY_REGIONS)
      .filter(([code]) => !LOW_VOLUME_COUNTRIES.has(code))
      .map(([, name]) => name),
  ),
  EUROPE_OTHER,
].sort();

/** Every value allowed in broad_region: UK NUTS1 regions plus country names. */
export const PUBLISHABLE_REGIONS: readonly string[] = [...BROAD_REGIONS, ...COUNTRY_REGION_NAMES];

export function countryRegion(code: string | null | undefined): string | null {
  const key = (code ?? "").trim().toUpperCase();
  if (key.length !== 2) return null;
  if (LOW_VOLUME_COUNTRIES.has(key)) return EUROPE_OTHER;
  return COUNTRY_REGIONS[key] ?? null;
}

const NUTS1_NAMES = new Set(Object.values(NUTS1_REGIONS));

/**
 * NUTS1/ITL1 region derived from a UK buyer address. The address fields are
 * read here and only the derived region name is returned; the postcode, town
 * and street never leave this function.
 */
export function buyerAddressRegion(
  buyer: { region?: string | null; postcode?: string | null; countryCode?: string | null } | null | undefined,
): BroadRegion | null {
  if (!buyer) return null;
  const country = (buyer.countryCode ?? "GB").trim().toUpperCase();
  if (country !== "GB" && country !== "UK") return null;
  const fromRegion = broadRegionFromLocation([buyer.region]);
  if (fromRegion && NUTS1_NAMES.has(fromRegion)) return fromRegion;
  const fromPostcode = buyer.postcode ? postcodeRegion(buyer.postcode) : null;
  return fromPostcode && NUTS1_NAMES.has(fromPostcode) ? fromPostcode : null;
}

const TED_SOURCE_KEY = "ted";
const FIND_A_TENDER_SOURCE_KEY = "find-a-tender";

/** The single region value stored on a preview. */
export function previewRegion(input: {
  sourceKey?: string | null;
  locationParts: Array<string | null | undefined>;
  buyer?: { region?: string | null; postcode?: string | null; countryCode?: string | null } | null;
}): string | null {
  if (input.sourceKey === TED_SOURCE_KEY) {
    return countryRegion(input.buyer?.countryCode);
  }
  const fromLocation = broadRegionFromLocation(input.locationParts);
  if (fromLocation) return fromLocation;
  if (input.sourceKey === FIND_A_TENDER_SOURCE_KEY) {
    return buyerAddressRegion(input.buyer);
  }
  return null;
}
