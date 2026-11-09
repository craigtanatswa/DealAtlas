import type { DealStatus } from "@/lib/search/filters";

const TENDER_TAGS = new Set(["tender", "tenderupdate", "tenderamendment"]);
const PLANNING_TAGS = new Set(["planning", "planningupdate"]);
const AWARD_TAGS = new Set(["award", "awardupdate"]);

const CONTRACT_NOTICE_TYPES = new Set([
  "2",
  "5",
  "8",
  "9",
  "10",
  "100",
  "102",
  "105",
  "contractnotice",
  "contract notice",
]);
const PRIOR_INFORMATION_NOTICE_TYPES = new Set([
  "1",
  "4",
  "101",
  "pin",
  "priorinformation",
  "prior information",
  "priorinformationnotice",
  "prior information notice",
]);
const AWARD_NOTICE_TYPES = new Set([
  "3",
  "6",
  "104",
  "award",
  "awardnotice",
  "award notice",
  "contractawardnotice",
  "contract award notice",
]);

const CONTRACT_DOCUMENT_TYPES = new Set(["contractnotice", "contract notice"]);
const PRIOR_INFORMATION_DOCUMENT_TYPES = new Set([
  "priorinformationnotice",
  "prior information notice",
  "pin",
]);
const AWARD_DOCUMENT_TYPES = new Set([
  "awardnotice",
  "award notice",
  "contractawardnotice",
  "contract award notice",
]);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function normalize(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s_-]+/g, " ")
    : typeof value === "number"
      ? String(value)
      : "";
}

function normalizedList(values: readonly unknown[] | null | undefined): string[] {
  return (values ?? [])
    .map((value) => normalize(value))
    .filter((value) => value.length > 0);
}

function matches(set: ReadonlySet<string>, values: readonly string[]): boolean {
  return values.some((value) => set.has(value) || set.has(value.replace(/\s+/g, "")));
}

function instant(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Maps a Public Contracts Scotland release to our deal status enum. Values the
 * portal has changed or that we do not recognise return null so the deal stays
 * held (UNCLASSIFIED) instead of being published with a guessed status.
 *
 * PCS prior-information notices keep their planned status even when the
 * expected future notice date has passed; those are the deals that were held.
 */
export function mapPublicContractsScotlandStatus(input: {
  tags?: readonly (string | null | undefined)[] | null;
  tag?: readonly (string | null | undefined)[] | null;
  tenderStatus?: string | null;
  lotStatus?: string | null;
  status?: string | null;
  noticeType?: string | number | null;
  documentTypes?: readonly (string | null | undefined)[] | null;
  documentType?: string | null;
  submissionDeadline?: string | null;
  futureTenderDate?: string | null;
  futureNoticeDate?: string | null;
  now: Date;
  hasAwards?: boolean;
  hasContracts?: boolean;
}): DealStatus | null {
  const tags = normalizedList(input.tags ?? input.tag);
  const documentTypes = normalizedList([
    ...(input.documentTypes ?? []),
    input.documentType,
  ]);
  const noticeTypes = normalizedList([input.noticeType]);
  const status = normalize(
    input.lotStatus ?? input.tenderStatus ?? input.status,
  );
  const hasAwards = input.hasAwards === true;

  const awardNotice =
    hasAwards ||
    tags.some((tag) => AWARD_TAGS.has(tag)) ||
    matches(AWARD_NOTICE_TYPES, noticeTypes) ||
    matches(AWARD_DOCUMENT_TYPES, documentTypes);
  const contractNotice =
    tags.some((tag) => TENDER_TAGS.has(tag)) ||
    status === "active" ||
    matches(CONTRACT_NOTICE_TYPES, noticeTypes) ||
    matches(CONTRACT_DOCUMENT_TYPES, documentTypes);
  const priorInformation =
    status === "planned" ||
    tags.some((tag) => PLANNING_TAGS.has(tag)) ||
    matches(PRIOR_INFORMATION_NOTICE_TYPES, noticeTypes) ||
    matches(PRIOR_INFORMATION_DOCUMENT_TYPES, documentTypes);

  if (status === "withdrawn" || tags.includes("tendercancellation")) {
    return "WITHDRAWN";
  }
  if (status === "cancelled") {
    return "CANCELLED";
  }
  if (status === "expired") {
    return "EXPIRED";
  }
  if (status === "unsuccessful" || status === "closed") {
    return "CLOSED";
  }
  if (status === "complete") {
    return awardNotice ? "AWARDED" : "CLOSED";
  }
  if (awardNotice) {
    return "AWARDED";
  }
  if (tags.includes("contract") && status !== "active") {
    return "ACTIVE";
  }

  if (priorInformation && !contractNotice) {
    return "UPCOMING";
  }

  if (contractNotice) {
    const deadline = instant(input.submissionDeadline);
    if (deadline != null) {
      if (deadline < input.now.getTime()) {
        return "CLOSED";
      }
      if (deadline - input.now.getTime() <= SEVEN_DAYS_MS) {
        return "CLOSING_SOON";
      }
      return "OPEN";
    }
    if (
      status === "active" ||
      matches(CONTRACT_NOTICE_TYPES, noticeTypes) ||
      matches(CONTRACT_DOCUMENT_TYPES, documentTypes)
    ) {
      return "OPEN";
    }
  }

  return null;
}
