import type { CanonicalCandidate } from "@/ingestion/core/types";
import { londonDeadlineDate, normalizeTitle } from "@/ingestion/normalizers/text";
import { OPEN_NOTICE_SOURCE_KEYS } from "@/ingestion/sources/procontract/constants";
import type {
  DataSourceRecord,
  IngestionStore,
  RawRecordRow,
} from "@/ingestion/store/types";

/**
 * Link a ProContract row onto an existing Find a Tender or Contracts Finder
 * deal. Matching is OCID, then procurement reference, then title + buyer + deadline.
 * A match does not update the open-notice deal and does not create a second one.
 */
export async function linkProcontractDuplicate(options: {
  store: IngestionStore;
  source: DataSourceRecord;
  raw: RawRecordRow;
  candidate: CanonicalCandidate;
  now: Date;
}): Promise<boolean> {
  const { store, source, raw, candidate, now } = options;
  const openSourceIds: string[] = [];
  for (const key of OPEN_NOTICE_SOURCE_KEYS) {
    const open = await store.getSourceByKey(key);
    if (open) {
      openSourceIds.push(open.id);
    }
  }

  const existing = await findOpenDuplicate(store, candidate, openSourceIds);
  if (!existing || existing.primarySourceId === source.id) {
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

async function findOpenDuplicate(
  store: IngestionStore,
  candidate: CanonicalCandidate,
  openSourceIds: string[],
) {
  if (candidate.ocid && !candidate.ocid.startsWith("da-")) {
    const byOcid = await store.findDealByOcid(candidate.ocid);
    if (byOcid && byOcid.primarySourceId && openSourceIds.includes(byOcid.primarySourceId)) {
      return byOcid;
    }
  }

  if (candidate.reference && openSourceIds.length > 0) {
    const byReference = await store.findDealByReferenceAmongSources(
      openSourceIds,
      candidate.reference,
    );
    if (byReference) {
      return byReference;
    }
  }

  const buyer = candidate.organizations.find((org) => org.roles.includes("BUYER"));
  const deadlineDate = londonDeadlineDate(candidate.submissionDeadline);
  if (!buyer || !deadlineDate || openSourceIds.length === 0) {
    return null;
  }
  return store.findDealByTitleBuyerDeadline({
    sourceIds: openSourceIds,
    normalizedTitle: normalizeTitle(candidate.sourceTitle),
    normalizedBuyerName: normalizeTitle(buyer.name),
    deadlineDate,
  });
}
