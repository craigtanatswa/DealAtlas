import type { CanonicalCandidate } from "@/ingestion/core/types";
import { toTimestamptz } from "@/ingestion/normalizers/text";
import {
  mapFindATenderRelease,
  parseOcdsRelease,
  parseReleasePackage,
} from "@/ingestion/sources/find-a-tender/parse";
import type { OcdsRelease } from "@/ingestion/sources/find-a-tender/schema";
import {
  CONTRACTS_FINDER_PARSER_VERSION,
  CONTRACTS_FINDER_SOURCE_KEY,
  FIND_A_TENDER_OCID_PREFIX,
  contractsFinderNoticeUrl,
} from "@/ingestion/sources/contracts-finder/constants";
import { mapContractsFinderDealStatus } from "@/ingestion/sources/contracts-finder/status";

export { CONTRACTS_FINDER_PARSER_VERSION };

function tagsOf(release: OcdsRelease): string[] {
  if (!release.tag) {
    return [];
  }
  return (Array.isArray(release.tag) ? release.tag : [release.tag]).map((tag) =>
    tag.toLowerCase(),
  );
}

/** Find a Tender OCIDs cited on this release. Not titles or URLs. */
export function findATenderCrossReferenceOcids(release: OcdsRelease): string[] {
  const keys = new Set<string>();
  if (release.ocid.startsWith(FIND_A_TENDER_OCID_PREFIX)) {
    keys.add(release.ocid);
  }
  for (const item of release.relatedProcesses ?? []) {
    const scheme = (item.scheme ?? "ocid").toLowerCase();
    const identifier = item.identifier;
    if (!identifier || scheme !== "ocid") {
      continue;
    }
    if (identifier.startsWith(FIND_A_TENDER_OCID_PREFIX)) {
      keys.add(identifier);
    }
  }
  return [...keys];
}

export function mapContractsFinderRelease(
  release: OcdsRelease,
  now: Date,
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
  const noticeId = String(release.id);
  const crossRefs = findATenderCrossReferenceOcids(release);

  return {
    ...mapped,
    sourceKey: CONTRACTS_FINDER_SOURCE_KEY,
    sourceUrl: contractsFinderNoticeUrl(noticeId),
    status,
    lots: mapped.lots.map((lot) => ({ ...lot, status })),
    relatedOcids: [...new Set([...mapped.relatedOcids, ...crossRefs])],
  };
}

export function parseContractsFinderRaw(
  payload: unknown,
  now: Date,
): CanonicalCandidate[] {
  return [mapContractsFinderRelease(parseOcdsRelease(payload), now)];
}

export function parseContractsFinderPackage(payload: unknown) {
  return parseReleasePackage(payload);
}
