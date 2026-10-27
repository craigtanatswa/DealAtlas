import type { CanonicalCandidate } from "@/ingestion/core/types";
import type { DealStage, DealStatus } from "@/lib/search/filters";
import { IngestionError } from "@/ingestion/core/errors";
import {
  blankToNull,
  formatExactValue,
  locationText,
  normalizeWhitespace,
} from "@/ingestion/normalizers/text";
import { mintPrivateOcid } from "@/ingestion/sources/private/parse";
import { canonicalPrivateCandidateSchema } from "@/ingestion/sources/private/schema";
import { parseInput } from "@/lib/validation";

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const CLOSING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

export function parseGrantDate(value: string | null | undefined): string | null {
  const text = blankToNull(value ?? null);
  if (!text) return null;
  const long = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(text);
  if (long) {
    const month = MONTHS[long[2].toLowerCase()];
    const day = Number(long[1]);
    const year = Number(long[3]);
    if (month == null || day < 1 || day > 31) return null;
    return new Date(Date.UTC(year, month, day)).toISOString();
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function grantLifecycle(options: {
  now: Date;
  opensAt: string | null;
  closesAt: string | null;
  label?: string | null;
}): { stage: DealStage; status: DealStatus } {
  const label = (options.label ?? "").toLowerCase();
  const opens = options.opensAt ? new Date(options.opensAt).getTime() : null;
  const closes = options.closesAt ? new Date(options.closesAt).getTime() : null;
  const now = options.now.getTime();
  if (/closed|awarded|cancelled|canceled/.test(label) || (closes != null && closes < now)) {
    return { stage: "ENDED", status: "CLOSED" };
  }
  if (/opening soon|upcoming|forthcoming/.test(label) || (opens != null && opens > now)) {
    return { stage: "PLANNING", status: "UPCOMING" };
  }
  if (closes != null && closes - now <= CLOSING_SOON_MS) {
    return { stage: "LIVE", status: "CLOSING_SOON" };
  }
  return { stage: "LIVE", status: "OPEN" };
}

export function decodeHtml(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  );
}

export function buildGrantCandidate(input: {
  sourceKey: string;
  id: string;
  title: string;
  description?: string | null;
  sourceUrl: string;
  funder?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  statusLabel?: string | null;
  valueMin?: number | null;
  valueMax?: number | null;
  exactValueText?: string | null;
  location?: string | null;
  reference?: string | null;
  mainCategory: string;
  now: Date;
}): CanonicalCandidate {
  const id = input.id.trim();
  const title = normalizeWhitespace(input.title);
  if (!id || !title) {
    throw new IngestionError({
      message: "Grant record is missing an id or title.",
      stage: "parse",
      code: "GRANT_RECORD_INCOMPLETE",
      retryable: false,
    });
  }
  const opensAt = input.opensAt ?? null;
  const closesAt = input.closesAt ?? null;
  const life = grantLifecycle({
    now: input.now,
    opensAt,
    closesAt,
    label: input.statusLabel,
  });
  const funder = blankToNull(input.funder ?? null);
  const organizations: CanonicalCandidate["organizations"] = funder
    ? [
        {
          sourcePartyId: funder
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 80) || "funder",
          name: funder,
          roles: ["BUYER", "FUNDER"],
          countryCode: "GB",
        },
      ]
    : [];
  const valueMin = input.valueMin ?? null;
  const valueMax = input.valueMax ?? input.valueMin ?? null;
  const candidate: CanonicalCandidate = {
    sourceKey: input.sourceKey,
    ocid: mintPrivateOcid(input.sourceKey, id),
    externalPrimaryId: id,
    noticeIdentifier: id,
    releaseId: id,
    reference: input.reference ?? id,
    sourceTitle: title,
    sourceDescription: blankToNull(input.description ?? null),
    sourceUrl: input.sourceUrl,
    applicationUrl: input.sourceUrl,
    dealType: "GRANT",
    buyerSector: "PUBLIC",
    stage: life.stage,
    status: life.status,
    mainCategory: input.mainCategory,
    procurementMethod: null,
    specialRegime: null,
    currency: "GBP",
    valueMinExVat: valueMin,
    valueMaxExVat: valueMax,
    exactValueText:
      input.exactValueText ?? formatExactValue(valueMin, valueMax, "GBP"),
    exactLocationText: locationText([input.location]),
    enquiryDeadline: null,
    submissionDeadline: closesAt,
    awardDecisionDate: null,
    contractStartDate: opensAt,
    contractEndDate: closesAt,
    extensionEndDate: null,
    nextProcurementDate: null,
    estimatedRenewalDate: null,
    smeSuitable: null,
    vcseSuitable: null,
    publishedAt: opensAt,
    modifiedAt: input.now.toISOString(),
    noticeType: "grant",
    noticeStage: input.statusLabel ?? life.status,
    buyerPartyId: organizations[0]?.sourcePartyId ?? null,
    organizations,
    lots: [],
    requirements: [],
    awardCriteria: [],
    awards: [],
    contracts: [],
    documents: [],
    classifications: [],
    relatedOcids: [],
  };
  parseInput(canonicalPrivateCandidateSchema, candidate, "Canonical grant candidate");
  return candidate;
}
