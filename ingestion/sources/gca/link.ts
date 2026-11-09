import type { CanonicalCandidate } from "@/ingestion/core/types";
import type { DataSourceRecord, IngestionStore, RawRecordRow } from "@/ingestion/store/types";

import { isRmNumber, normaliseRm } from "@/ingestion/sources/gca/text";

const OPEN_PORTAL_KEYS = ["find-a-tender", "contracts-finder"] as const;

export function referenceTokenRegex(reference: string): RegExp | null {
  const token = normaliseRm(reference);
  if (!isRmNumber(token)) {
    return null;
  }
  const escaped = token.replace(/[.]/g, "\\.");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}(?!\\.\\d)([^A-Za-z0-9]|$)`, "i");
}

export function textHasReferenceToken(reference: string, text: string | null | undefined): boolean {
  const pattern = referenceTokenRegex(reference);
  return Boolean(pattern && text && pattern.test(text));
}

/**
 * Same RM number on Find a Tender or Contracts Finder. A match attaches this
 * row to that deal and does not create a second public deal.
 */
export async function linkGcaPortalDuplicate(options: {
  store: IngestionStore;
  source: DataSourceRecord;
  raw: RawRecordRow;
  candidate: CanonicalCandidate;
  now: Date;
}): Promise<boolean> {
  const reference = options.candidate.reference?.trim();
  if (!reference) {
    return false;
  }
  const existing = await options.store.findDealByPortalReference(
    [...OPEN_PORTAL_KEYS],
    reference,
  );
  if (!existing || existing.primarySourceId === options.source.id) {
    return false;
  }
  const found = await options.store.findNotice(
    options.source.id,
    options.candidate.noticeIdentifier,
    options.candidate.releaseId,
  );
  if (!found) {
    const notice = await options.store.createNotice({
      dealId: existing.id,
      sourceId: options.source.id,
      rawRecordId: options.raw.id,
      noticeIdentifier: options.candidate.noticeIdentifier,
      releaseId: options.candidate.releaseId,
      noticeType: options.candidate.noticeType ?? null,
      noticeStage: options.candidate.noticeStage ?? null,
      sourceUrl: options.candidate.sourceUrl,
      publishedAt: options.candidate.publishedAt ?? null,
      modifiedAt: options.candidate.modifiedAt ?? options.now.toISOString(),
      isCurrentVersion: false,
    });
    await options.store.insertNoticeVersion({
      noticeId: notice.id,
      versionNumber: 1,
      contentHash: options.raw.contentHash,
      capturedAt: options.now.toISOString(),
    });
  }
  return true;
}
