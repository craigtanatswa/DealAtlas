import type { CanonicalCandidate } from "@/ingestion/core/types";
import { normalizeTitle } from "@/ingestion/normalizers/text";
import type {
  DataSourceRecord,
  IngestionStore,
  RawRecordRow,
} from "@/ingestion/store/types";

export const GRANT_SOURCE_KEYS = ["find-a-grant", "innovate-uk"] as const;

const MIN_TITLE_LENGTH = 24;

export function isGrantSource(sourceKey: string): boolean {
  return (GRANT_SOURCE_KEYS as readonly string[]).includes(sourceKey);
}

/**
 * Same normalised grant title on a deal from another source.
 * Short titles are left alone so unrelated notices are not merged.
 */
export async function linkGrantDuplicate(options: {
  store: IngestionStore;
  source: DataSourceRecord;
  raw: RawRecordRow;
  candidate: CanonicalCandidate;
  now: Date;
}): Promise<boolean> {
  const { store, source, raw, candidate, now } = options;
  const title = normalizeTitle(candidate.sourceTitle);
  if (title.length < MIN_TITLE_LENGTH) return false;
  const existing = await store.findDealByNormalizedTitle(title);
  if (!existing || existing.dealType !== "GRANT" || existing.primarySourceId === source.id) {
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
