import type { CanonicalCandidate } from "@/ingestion/core/types";
import type {
  DataSourceRecord,
  IngestionStore,
  RawRecordRow,
} from "@/ingestion/store/types";

/** Own OCID, then every relatedProcesses OCID. A hit on another source attaches. */
export function crossPublishedDuplicateKeys(candidate: CanonicalCandidate): string[] {
  const keys = new Set<string>();
  if (candidate.ocid) {
    keys.add(candidate.ocid);
  }
  for (const related of candidate.relatedOcids) {
    if (related) {
      keys.add(related);
    }
  }
  return [...keys];
}

export async function linkCrossPublishedDuplicate(options: {
  store: IngestionStore;
  source: DataSourceRecord;
  raw: RawRecordRow;
  candidate: CanonicalCandidate;
  now: Date;
}): Promise<boolean> {
  const { store, source, raw, candidate, now } = options;
  let existing: Awaited<ReturnType<IngestionStore["findDealByOcid"]>> = null;
  for (const key of crossPublishedDuplicateKeys(candidate)) {
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
