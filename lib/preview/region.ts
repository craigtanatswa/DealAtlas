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
