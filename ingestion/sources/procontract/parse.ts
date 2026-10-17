import { load } from "cheerio";
import { z } from "zod";

import type { CanonicalCandidate } from "@/ingestion/core/types";
import { IngestionError } from "@/ingestion/core/errors";
import { normalizeTitle } from "@/ingestion/normalizers/text";
import { PROCONTRACT_ORIGIN } from "@/ingestion/sources/procontract/constants";

const OCID_PATTERN = /\bocds-[a-z0-9]+-[a-z0-9-]+\b/i;
const ADVERT_ID_PATTERN =
  /advertId=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

const listingRowSchema = z.object({
  advertId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  buyer: z.string().trim().min(1).max(300).nullable(),
  expressionEnd: z.string().trim().nullable(),
  estimatedValue: z.string().trim().nullable(),
  href: z.string().trim().min(1),
});

export type ProcontractListingRow = z.infer<typeof listingRowSchema>;

export type ProcontractDetail = {
  reference: string | null;
  description: string | null;
  ocid: string | null;
  buyer: string | null;
  deadline: string | null;
  valueText: string | null;
};

export function isAccessRestrictedHtml(html: string): boolean {
  const lower = html.toLowerCase();
  const password = /type=["']password["']/.test(lower);
  const captcha =
    lower.includes("g-recaptcha") ||
    lower.includes("h-captcha") ||
    lower.includes("cf-challenge") ||
    lower.includes("captcha");
  const publicList = lower.includes("opportunitiesgrid") || lower.includes("advertid=");
  return (password || captcha) && !publicList;
}

export function parseProcontractListing(html: string): ProcontractListingRow[] {
  if (isAccessRestrictedHtml(html)) {
    throw new IngestionError({
      message: "ProContract page is a login or CAPTCHA wall.",
      stage: "discover",
      code: "ACCESS_RESTRICTED",
      retryable: false,
    });
  }

  const $ = load(html);
  const rows: ProcontractListingRow[] = [];
  $("#opportunitiesGrid tbody tr").each((_, element) => {
    try {
      const cells = $(element).find("td");
      const link = cells.eq(0).find("a").first();
      const href = link.attr("href") ?? "";
      const advertId = ADVERT_ID_PATTERN.exec(href)?.[1];
      const title = link.text().replace(/\s+/g, " ").trim();
      if (!advertId || !title) {
        return;
      }
      const parsed = listingRowSchema.safeParse({
        advertId,
        title,
        buyer: textOrNull(cells.eq(1).text()),
        expressionEnd: textOrNull(cells.eq(3).text()),
        estimatedValue: textOrNull(cells.eq(4).text()),
        href,
      });
      if (!parsed.success) {
        return;
      }
      rows.push(parsed.data);
    } catch {
      // One malformed row does not stop the rest of the grid.
    }
  });
  return rows;
}

export function parseProcontractDetail(html: string): ProcontractDetail {
  if (isAccessRestrictedHtml(html)) {
    throw new IngestionError({
      message: "ProContract detail page is a login or CAPTCHA wall.",
      stage: "fetch",
      code: "ACCESS_RESTRICTED",
      retryable: false,
    });
  }
  const $ = load(html);
  const fields = new Map<string, string>();
  $("tr").each((_, element) => {
    const cells = $(element).find("th,td");
    if (cells.length < 2) {
      return;
    }
    const label = cells.eq(0).text().replace(/\s+/g, " ").trim().toLowerCase();
    const value = cells.eq(1).text().replace(/\s+/g, " ").trim();
    if (label && value) {
      fields.set(label, value);
    }
  });
  const blob = $("body").text().replace(/\s+/g, " ");
  return {
    reference: labeled(fields, ["reference", "reference number", "procurement reference"]),
    description: labeled(fields, ["description", "summary", "details"]),
    ocid: OCID_PATTERN.exec(blob)?.[0] ?? null,
    buyer: labeled(fields, ["buyer", "organisation", "organization", "authority"]),
    deadline: labeled(fields, ["expression end", "deadline", "closing date", "respond by"]),
    valueText: labeled(fields, ["estimated value", "value", "contract value"]),
  };
}

export function procontractCandidate(input: {
  sourceKey: string;
  row: ProcontractListingRow;
  detail?: ProcontractDetail | null;
}): CanonicalCandidate {
  const detail = input.detail ?? null;
  const buyerName = detail?.buyer || input.row.buyer;
  const description = detail?.description ?? null;
  const ocidFromText = detail?.ocid ?? OCID_PATTERN.exec(input.row.title)?.[0] ?? null;
  const advertId = input.row.advertId;
  const sourceUrl = advertUrl(input.row.href);
  const deadline = parseUkDate(detail?.deadline || input.row.expressionEnd);
  const value = parseMoney(detail?.valueText || input.row.estimatedValue);
  const reference = detail?.reference ?? null;
  const buyerPartyId = buyerName ? `buyer-${normalizeTitle(buyerName).slice(0, 80)}` : null;

  return {
    sourceKey: input.sourceKey,
    ocid: ocidFromText ?? `da-${input.sourceKey}-${advertId}`,
    externalPrimaryId: advertId,
    noticeIdentifier: advertId,
    releaseId: advertId,
    reference,
    sourceTitle: input.row.title,
    sourceDescription: description,
    sourceUrl,
    applicationUrl: null,
    dealType: "PUBLIC_TENDER",
    buyerSector: "PUBLIC",
    stage: "LIVE",
    status: "OPEN",
    mainCategory: null,
    procurementMethod: null,
    specialRegime: null,
    currency: "GBP",
    valueMinExVat: value,
    valueMaxExVat: value,
    exactValueText: value == null ? null : detail?.valueText || input.row.estimatedValue,
    exactLocationText: null,
    enquiryDeadline: null,
    submissionDeadline: deadline,
    awardDecisionDate: null,
    contractStartDate: null,
    contractEndDate: null,
    extensionEndDate: null,
    nextProcurementDate: null,
    estimatedRenewalDate: null,
    smeSuitable: null,
    vcseSuitable: null,
    publishedAt: null,
    modifiedAt: null,
    noticeType: null,
    noticeStage: null,
    buyerPartyId,
    organizations: buyerName
      ? [
          {
            sourcePartyId: buyerPartyId ?? buyerName,
            name: buyerName,
            roles: ["BUYER"],
          },
        ]
      : [],
    lots: [],
    requirements: [],
    awardCriteria: [],
    awards: [],
    contracts: [],
    documents: [],
    classifications: [],
    relatedOcids: ocidFromText ? [ocidFromText] : [],
  };
}

export function advertUrl(href: string): string {
  return new URL(href, PROCONTRACT_ORIGIN).toString();
}

function textOrNull(value: string): string | null {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || /^n\/a$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function labeled(fields: Map<string, string>, names: string[]): string | null {
  for (const name of names) {
    const value = fields.get(name);
    if (value) {
      return value;
    }
  }
  return null;
}

export function parseUkDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const iso = `${match[3]}-${month}-${day}T12:00:00.000Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export function parseMoney(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match?.[1]) {
    return null;
  }
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}
