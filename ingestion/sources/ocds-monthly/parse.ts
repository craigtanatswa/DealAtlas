import type { CanonicalCandidate } from "@/ingestion/core/types";
import { toTimestamptz } from "@/ingestion/normalizers/text";
import { mapContractsFinderDealStatus } from "@/ingestion/sources/contracts-finder/status";
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
  const status = mapContractsFinderDealStatus({
    tags,
    submissionDeadline: mapped.submissionDeadline,
    futureTenderDate,
    now,
  });

  return {
    ...mapped,
    sourceKey: source.sourceKey,
    sourceUrl: source.noticeUrl(release.ocid),
    status,
    lots: mapped.lots.map((lot) => ({ ...lot, status })),
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
