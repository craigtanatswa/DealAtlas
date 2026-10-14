import type { CanonicalCandidate } from "@/ingestion/core/types";
import { FIND_A_TENDER_OCID_PREFIX } from "@/ingestion/sources/contracts-finder/constants";
import type {
  DataSourceRecord,
  IngestionStore,
  RawRecordRow,
} from "@/ingestion/store/types";

/**
 * Same OCID, or a relatedProcesses OCID in the Find a Tender prefix.
 * A match links a Contracts Finder notice onto the existing deal and does
 * not update that deal, so a second public deal is not created.
 */
export function contractsFinderDuplicateKeys(candidate: CanonicalCandidate): string[] {
  const keys = new Set<string>();
  if (candidate.ocid) {
    keys.add(candidate.ocid);
  }
  for (const related of candidate.relatedOcids) {
    if (related.startsWith(FIND_A_TENDER_OCID_PREFIX)) {
      keys.add(related);
    }
  }
  return [...keys];
}

export async function linkContractsFinderDuplicate(options: {
  store: IngestionStore;
  source: DataSourceRecord;
  raw: RawRecordRow;
  candidate: CanonicalCandidate;
  now: Date;
}): Promise<boolean> {
  const { store, source, raw, candidate, now } = options;
  let existing: Awaited<ReturnType<IngestionStore["findDealByOcid"]>> = null;
  for (const key of contractsFinderDuplicateKeys(candidate)) {
    const deal = await store.findDealByOcid(key);
    if (deal && deal.primarySourceId !== source.id) {
      existing = deal;
      break;
    }
  }
  if (!existing) {
    return false;
  }

  const found = await store.findNotice(
    source.id,
    candidate.noticeIdentifier,
    candidate.releaseId,
  );
  if (!found) {
    const notice = await store.createNotice({
      dealId: existing.id,
      sourceId: source.id,
      rawRecordId: raw.id,
      noticeIdentifier: candidate.noticeIdentifier,
      releaseId: candidate.releaseId,
      noticeType: candidate.noticeType ?? null,
      noticeStage: candidate.noticeStage ?? null,
      sourceUrl: candidate.sourceUrl,
      publishedAt: candidate.publishedAt ?? null,
      modifiedAt: candidate.modifiedAt ?? now.toISOString(),
      isCurrentVersion: false,
    });
    await store.insertNoticeVersion({
      noticeId: notice.id,
      versionNumber: 1,
      contentHash: raw.contentHash,
      capturedAt: now.toISOString(),
    });
  }
  return true;
}
