import type { IngestionStore } from "@/ingestion/store/types";

export type UnpublishExpiredResult = {
  unpublished: number;
};

/** Sets is_published false when the deal deadline has passed. Does not publish or delete. */
export async function unpublishExpiredDeals(options: {
  store: IngestionStore;
  now?: Date;
}): Promise<UnpublishExpiredResult> {
  const now = options.now ?? new Date();
  const unpublished = await options.store.unpublishExpiredPreviews(now.toISOString());
  return { unpublished };
}

export function unpublishExpiredLogLine(result: UnpublishExpiredResult): string {
  return JSON.stringify({ unpublished: result.unpublished });
}
