import type { CanonicalCandidate } from "@/ingestion/core/types";
import { toTimestamptz } from "@/ingestion/normalizers/text";
import { mapContractsFinderDealStatus } from "@/ingestion/sources/contracts-finder/status";
import { PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY } from "@/ingestion/sources/public-contracts-scotland/constants";
import { mapPublicContractsScotlandStatus } from "@/ingestion/sources/public-contracts-scotland/status";
import {
  mapFindATenderRelease,
  parseOcdsRelease,
  parseReleasePackage,
} from "@/ingestion/sources/find-a-tender/parse";
import type { OcdsRelease } from "@/ingestion/sources/find-a-tender/schema";

function tagsOf(release: OcdsRelease): string[] {
  if (!release.tag) {
    return [];
  }
  return (Array.isArray(release.tag) ? release.tag : [release.tag]).map((tag) =>
    tag.toLowerCase(),
  );
}

export function mapMonthlyOcdsRelease(
  release: OcdsRelease,
  now: Date,
  source: { sourceKey: string; noticeUrl: (ocid: string) => string },
): CanonicalCandidate {
  const mapped = mapFindATenderRelease(release, now);
  const tags = tagsOf(release);
  const futureTenderDate =
    toTimestamptz(release.tender?.tenderPeriod?.startDate) ??
    toTimestamptz(release.tender?.communication?.futureNoticeDate);
  const documentTypes = (release.tender?.documents ?? []).map(
    (document) => document.documentType,
  );
  const isPublicContractsScotland =
    source.sourceKey === PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY;
  const status = isPublicContractsScotland
    ? mapPublicContractsScotlandStatus({
        tags,
        tenderStatus: release.tender?.status,
        documentTypes,
        submissionDeadline: mapped.submissionDeadline,
        futureTenderDate,
        now,
        hasAwards: mapped.awards.length > 0,
        hasContracts: mapped.contracts.length > 0,
      }) ?? "UNCLASSIFIED"
    : mapContractsFinderDealStatus({
        tags,
        submissionDeadline: mapped.submissionDeadline,
        futureTenderDate,
        now,
      });
  const lotStatus = (lot: (typeof mapped.lots)[number]) =>
    isPublicContractsScotland
      ? mapPublicContractsScotlandStatus({
          tags,
          tenderStatus: release.tender?.status,
          lotStatus: lot.status,
          documentTypes,
          submissionDeadline: lot.submissionDeadline ?? mapped.submissionDeadline,
          futureTenderDate,
          now,
          hasAwards: mapped.awards.some((award) =>
            award.relatedLotIds?.includes(lot.sourceLotId),
          ),
          hasContracts: mapped.contracts.length > 0,
        }) ?? status
      : status;

  return {
    ...mapped,
    sourceKey: source.sourceKey,
    sourceUrl: source.noticeUrl(release.ocid),
    status,
    lots: mapped.lots.map((lot) => ({ ...lot, status: lotStatus(lot) })),
  };
}

export function parseMonthlyOcdsRaw(
  payload: unknown,
  now: Date,
  source: { sourceKey: string; noticeUrl: (ocid: string) => string },
): CanonicalCandidate[] {
  return [mapMonthlyOcdsRelease(parseOcdsRelease(payload), now, source)];
}

export function parseMonthlyOcdsPackage(payload: unknown) {
  return parseReleasePackage(payload);
}
