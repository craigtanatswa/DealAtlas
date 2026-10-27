import { safeHttpUrl } from "@/lib/deals/urls";

import type {
  CanonicalCandidate,
  ClassificationCandidate,
  DocumentCandidate,
  LotCandidate,
} from "@/ingestion/core/types";
import { IngestionError } from "@/ingestion/core/errors";
import {
  categoryFromCpv,
  mapDealStatus,
  mapDealType,
} from "@/ingestion/normalizers/taxonomy";
import {
  asRecord,
  asString,
  domainFromWebsite,
  formatExactValue,
  locationText,
  normalizeCurrency,
  toDateOnly,
  toTimestamptz,
} from "@/ingestion/normalizers/text";
import {
  TED_PARSER_VERSION,
  TED_SOURCE_KEY,
  tedNoticeUrl,
} from "@/ingestion/sources/ted/constants";

export { TED_PARSER_VERSION };

const ISO3_COUNTRY: Record<string, { iso2: string; name: string }> = {
  AUT: { iso2: "AT", name: "Austria" },
  BEL: { iso2: "BE", name: "Belgium" },
  BGR: { iso2: "BG", name: "Bulgaria" },
  HRV: { iso2: "HR", name: "Croatia" },
  CYP: { iso2: "CY", name: "Cyprus" },
  CZE: { iso2: "CZ", name: "Czechia" },
  DNK: { iso2: "DK", name: "Denmark" },
  EST: { iso2: "EE", name: "Estonia" },
  FIN: { iso2: "FI", name: "Finland" },
  FRA: { iso2: "FR", name: "France" },
  DEU: { iso2: "DE", name: "Germany" },
  GRC: { iso2: "GR", name: "Greece" },
  HUN: { iso2: "HU", name: "Hungary" },
  IRL: { iso2: "IE", name: "Ireland" },
  ITA: { iso2: "IT", name: "Italy" },
  LVA: { iso2: "LV", name: "Latvia" },
  LTU: { iso2: "LT", name: "Lithuania" },
  LUX: { iso2: "LU", name: "Luxembourg" },
  MLT: { iso2: "MT", name: "Malta" },
  NLD: { iso2: "NL", name: "Netherlands" },
  POL: { iso2: "PL", name: "Poland" },
  PRT: { iso2: "PT", name: "Portugal" },
  ROU: { iso2: "RO", name: "Romania" },
  SVK: { iso2: "SK", name: "Slovakia" },
  SVN: { iso2: "SI", name: "Slovenia" },
  ESP: { iso2: "ES", name: "Spain" },
  SWE: { iso2: "SE", name: "Sweden" },
};

export type TedSearchPage = {
  notices: unknown[];
  nextToken?: string;
  timedOut: boolean;
};

export function parseTedSearchPage(payload: unknown): TedSearchPage {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.notices)) {
    throw new IngestionError({
      message: "notices",
      stage: "discover",
      code: "PARSE_FAILED",
    });
  }
  const token = asString(record.iterationNextToken);
  return {
    notices: record.notices,
    nextToken: token || undefined,
    timedOut: record.timedOut === true,
  };
}

/** A closed or undated notice is not a row. A notice with no title is an error. */
export function parseTedNotice(
  payload: unknown,
  now: Date,
): CanonicalCandidate | null {
  const notice = asRecord(payload);
  const publicationNumber = asString(notice?.["publication-number"])?.trim();
  if (!publicationNumber) {
    throw new IngestionError({
      message: "publication-number",
      stage: "parse",
      code: "PARSE_FAILED",
    });
  }
  const title = firstText(notice?.["notice-title"]);
  if (!title) {
    throw new IngestionError({
      message: "notice-title",
      stage: "parse",
      code: "PARSE_FAILED",
    });
  }

  const deadlines = instants(notice?.["deadline-receipt-request"]);
  if (deadlines.length === 0) {
    throw new IngestionError({
      message: "deadline-receipt-request",
      stage: "parse",
      code: "PARSE_FAILED",
    });
  }
  const latestDeadline = deadlines.reduce((latest, value) =>
    value > latest ? value : latest,
  );
  if (Date.parse(latestDeadline) <= now.getTime()) {
    return null;
  }

  const descriptions = localizedList(notice?.["description-lot"]);
  const procedureDescription = firstText(notice?.["description-proc"]);
  const lotValues = numbers(notice?.["estimated-value-lot"]);
  const lotCurrencies = localizedList(notice?.["estimated-value-cur-lot"]);
  const lotStarts = localizedList(notice?.["contract-duration-start-date-lot"]);
  const lotEnds = localizedList(notice?.["contract-duration-end-date-lot"]);
  const lotCount = Math.max(
    descriptions.length,
    lotValues.length,
    1,
  );
  const procedureValue = numbers(notice?.["estimated-value-proc"])[0] ?? null;
  const procedureCurrency = normalizeCurrency(
    firstText(notice?.["estimated-value-cur-proc"]) ?? lotCurrencies[0],
    "EUR",
  );
  const cpvCodes = localizedList(notice?.["classification-cpv"]);
  const classifications: ClassificationCandidate[] = cpvCodes.map((code, index) => ({
    scheme: "CPV",
    code,
    description: null,
    isPrimary: index === 0,
  }));
  const category = categoryFromCpv(cpvCodes[0]);
  const countries = countryNames(notice?.["place-of-performance"]);
  const buyerCountry = countryNames(notice?.["buyer-country"])[0] ?? null;
  const exactLocation = locationText(countries.length > 0 ? countries : [buyerCountry]);
  const framework = localizedList(notice?.["framework-agreement-lot"]).some(
    (value) => value !== "none" && value !== "no",
  );
  const buyerName = firstText(notice?.["buyer-name"]);
  const email = firstText(notice?.["organisation-email-buyer"]);
  const phone = firstText(notice?.["organisation-tel-buyer"]);
  const website = safeHttpUrl(firstText(notice?.["buyer-internet-address"]));
  const city = firstText(notice?.["buyer-city"]);
  const reference = firstText(notice?.["internal-identifier-proc"]) ?? publicationNumber;
  const html = englishLink(notice?.links);
  const sourceUrl = safeHttpUrl(html) ?? tedNoticeUrl(publicationNumber);
  const documents = documentsFrom(notice?.["document-url-lot"], title);
  const valueMax = procedureValue ?? (lotValues.length > 0 ? Math.max(...lotValues) : null);
  const valueMin = lotValues.length > 0 ? Math.min(...lotValues) : valueMax;

  const lots: LotCandidate[] = [];
  for (let index = 0; index < lotCount; index += 1) {
    const description = descriptions[index] ?? (index === 0 ? procedureDescription : null);
    const lotValue = lotValues[index] ?? null;
    lots.push({
      sourceLotId: String(index + 1),
      lotNumber: String(index + 1),
      sourceTitle: title,
      sourceDescription: description,
      status: mapDealStatus({
        tags: ["tender"],
        submissionDeadline: latestDeadline,
        now,
        hasAwards: false,
      }),
      currency: normalizeCurrency(lotCurrencies[index], procedureCurrency),
      valueMin: lotValue,
      valueMax: lotValue,
      exactLocationText: exactLocation,
      submissionDeadline: latestDeadline,
      contractStartDate: toDateOnly(normalizeTedDate(lotStarts[index])),
      contractEndDate: toDateOnly(normalizeTedDate(lotEnds[index])),
    });
  }

  const organizations = buyerName
    ? [
        {
          sourcePartyId: publicationNumber,
          name: buyerName,
          roles: ["BUYER" as const],
          website,
          domain: domainFromWebsite(website),
          email,
          phone,
          city,
          countryCode: iso2(firstCode(notice?.["buyer-country"])),
        },
      ]
    : [];

  return {
    sourceKey: TED_SOURCE_KEY,
    ocid: `ted-${publicationNumber}`,
    externalPrimaryId: publicationNumber,
    noticeIdentifier: publicationNumber,
    releaseId: publicationNumber,
    reference,
    sourceTitle: title,
    sourceDescription: procedureDescription ?? descriptions[0] ?? null,
    sourceUrl,
    applicationUrl: website,
    dealType: mapDealType({
      tags: ["tender"],
      hasFramework: framework,
      hasDynamicMarket: false,
    }),
    buyerSector: "PUBLIC",
    stage: "LIVE",
    status: mapDealStatus({
      tags: ["tender"],
      submissionDeadline: latestDeadline,
      now,
      hasAwards: false,
    }),
    mainCategory: category?.label ?? null,
    procurementMethod: firstText(notice?.["procedure-type"]),
    specialRegime: null,
    currency: procedureCurrency,
    valueMinExVat: valueMin,
    valueMaxExVat: valueMax,
    exactValueText: formatExactValue(valueMin, valueMax, procedureCurrency),
    exactLocationText: exactLocation,
    submissionDeadline: latestDeadline,
    contractStartDate: lots[0]?.contractStartDate ?? null,
    contractEndDate: lots[0]?.contractEndDate ?? null,
    publishedAt: toTimestamptz(normalizeTedDate(firstText(notice?.["publication-date"]))),
    noticeType: firstText(notice?.["notice-type"]),
    buyerPartyId: buyerName ? publicationNumber : null,
    organizations,
    lots,
    requirements: [],
    awardCriteria: [],
    awards: [],
    contracts: [],
    documents,
    classifications,
    relatedOcids: [],
  };
}

export function parseTedRaw(payload: unknown, now: Date): CanonicalCandidate[] {
  const record = asRecord(payload);
  const notice = record && "notice" in record ? record.notice : payload;
  const candidate = parseTedNotice(notice, now);
  return candidate ? [candidate] : [];
}

function firstText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstText(item);
      if (text) {
        return text;
      }
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const preferred = record.eng ?? record.ENG ?? record.en;
  if (preferred !== undefined) {
    const text = firstText(preferred);
    if (text) {
      return text;
    }
  }
  for (const item of Object.values(record)) {
    const text = firstText(item);
    if (text) {
      return text;
    }
  }
  return null;
}

function localizedList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => firstText(item))
      .filter((item): item is string => Boolean(item));
  }
  const record = asRecord(value);
  if (record) {
    const preferred = record.eng ?? record.ENG ?? record.en;
    if (Array.isArray(preferred)) {
      return preferred
        .map((item) => firstText(item))
        .filter((item): item is string => Boolean(item));
    }
    for (const item of Object.values(record)) {
      if (Array.isArray(item)) {
        return item
          .map((entry) => firstText(entry))
          .filter((entry): entry is string => Boolean(entry));
      }
    }
  }
  const single = firstText(value);
  return single ? [single] : [];
}

function numbers(value: unknown): number[] {
  return localizedList(value)
    .map((item) => Number(item.replace(/,/g, "")))
    .filter((item) => Number.isFinite(item));
}

function instants(value: unknown): string[] {
  return localizedList(value)
    .map((item) => toTimestamptz(normalizeTedDate(item)))
    .filter((item): item is string => Boolean(item));
}

function normalizeTedDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const offsetDate = /^(\d{4}-\d{2}-\d{2})([+-]\d{2}:\d{2})$/.exec(value);
  if (offsetDate) {
    return `${offsetDate[1]}T00:00:00${offsetDate[2]}`;
  }
  return value;
}

function firstCode(value: unknown): string | null {
  const text = firstText(value)?.toUpperCase();
  return text && /^[A-Z]{3}$/.test(text) ? text : null;
}

function iso2(code: string | null): string | null {
  return code ? ISO3_COUNTRY[code]?.iso2 ?? null : null;
}

function countryNames(value: unknown): string[] {
  const names: string[] = [];
  for (const item of localizedList(value)) {
    const country = ISO3_COUNTRY[item.toUpperCase()];
    if (country && !names.includes(country.name)) {
      names.push(country.name);
    }
    if (item.toLowerCase() === "anyw-eea" && !names.includes("EEA")) {
      names.push("EEA");
    }
  }
  return names;
}

function englishLink(value: unknown): string | null {
  const links = asRecord(value);
  const html = asRecord(links?.html);
  return asString(html?.ENG) ?? asString(html?.eng) ?? null;
}

function documentsFrom(value: unknown, fallbackName: string): DocumentCandidate[] {
  const documents: DocumentCandidate[] = [];
  for (const item of localizedList(value)) {
    const url = safeHttpUrl(item);
    if (!url) {
      continue;
    }
    documents.push({
      name: fallbackName,
      documentType: "tenderDocument",
      sourceUrl: url,
    });
  }
  return documents;
}
