import {
  deadlineBandFromDeadline,
  type DeadlineBand,
} from "@/lib/preview/bands";

// 200 ids keep the deals in() filter URL well under proxy limits.
export const BAND_REFRESH_PAGE_SIZE = 200;
export const BAND_REFRESH_UPDATE_CHUNK = 100;

type QueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

type PreviewRow = {
  deal_id: string;
  deadline_band: string | null;
};

type DealRow = {
  id: string;
  submission_deadline: string | null;
  status: string | null;
};

type UpdatedPreviewRow = {
  deal_id: string;
  is_published: boolean;
};

type PreviewPageQuery = {
  limit: (count: number) => QueryResult<PreviewRow>;
};

type PreviewOrderedQuery = PreviewPageQuery & {
  gt: (column: string, value: string) => PreviewPageQuery;
};

type PreviewListQuery = {
  eq: (column: string, value: boolean) => {
    order: (column: string) => PreviewOrderedQuery;
  };
};

type DealListQuery = {
  in: (column: string, values: readonly string[]) => QueryResult<DealRow>;
};

type PreviewUpdateQuery = {
  in: (column: string, values: readonly string[]) => {
    eq: (column: string, value: boolean) => {
      select: (columns: string) => QueryResult<UpdatedPreviewRow>;
    };
  };
};

export type BandRefreshClient = {
  from(table: "deal_previews"): {
    select: (columns: string) => PreviewListQuery;
    update: (values: { deadline_band: DeadlineBand }) => PreviewUpdateQuery;
  };
  from(table: "deals"): {
    select: (columns: string) => DealListQuery;
  };
};

export type BandRefreshResult = {
  scanned: number;
  stale: number;
  updated: number;
  unpublishedByGate: number;
  byBand: Record<string, number>;
};

export function liveDeadlineBand(input: {
  deadline: string | null;
  status: string | null;
  now: Date;
}): DeadlineBand | null {
  if (!input.deadline) {
    return null;
  }
  const due = new Date(input.deadline);
  if (Number.isNaN(due.getTime())) {
    return null;
  }
  const band = deadlineBandFromDeadline(input.deadline, input.now, input.status);
  return band === "Closed" ? null : band;
}

export function planBandUpdates(
  rows: Array<{
    dealId: string;
    stored: string | null;
    deadline: string | null;
    status: string | null;
  }>,
  now: Date,
): Map<DeadlineBand, string[]> {
  const updates = new Map<DeadlineBand, string[]>();
  for (const row of rows) {
    const band = liveDeadlineBand({
      deadline: row.deadline,
      status: row.status,
      now,
    });
    if (!band || band === row.stored) {
      continue;
    }
    const ids = updates.get(band);
    if (ids) {
      ids.push(row.dealId);
    } else {
      updates.set(band, [row.dealId]);
    }
  }
  return updates;
}

export async function refreshDeadlineBands(input: {
  client: BandRefreshClient;
  now?: Date;
  apply: boolean;
}): Promise<BandRefreshResult> {
  const now = input.now ?? new Date();
  const result: BandRefreshResult = {
    scanned: 0,
    stale: 0,
    updated: 0,
    unpublishedByGate: 0,
    byBand: {},
  };

  try {
    // Keyset pagination on deal_id: rows the publish gate takes down mid-run
    // cannot shift later pages, unlike offset paging.
    let after: string | null = null;
    while (true) {
      const ordered = input.client
        .from("deal_previews")
        .select("deal_id, deadline_band")
        .eq("is_published", true)
        .order("deal_id");
      const pageQuery: PreviewPageQuery =
        after === null ? ordered : ordered.gt("deal_id", after);
      const pageResult: { data: PreviewRow[] | null; error: { message: string } | null } =
        await pageQuery.limit(BAND_REFRESH_PAGE_SIZE);
      if (pageResult.error) {
        throw new Error("deadline band refresh failed");
      }
      const previews = pageResult.data ?? [];
      result.scanned += previews.length;
      if (previews.length === 0) {
        break;
      }

      const ids = previews.map((preview) => preview.deal_id);
      const dealsResult = await input.client
        .from("deals")
        .select("id, submission_deadline, status")
        .in("id", ids);
      if (dealsResult.error) {
        throw new Error("deadline band refresh failed");
      }
      const dealsById = new Map(
        (dealsResult.data ?? []).map((deal) => [deal.id, deal]),
      );
      const plan = planBandUpdates(
        previews.map((preview) => {
          const deal = dealsById.get(preview.deal_id);
          return {
            dealId: preview.deal_id,
            stored: preview.deadline_band,
            deadline: deal?.submission_deadline ?? null,
            status: deal?.status ?? null,
          };
        }),
        now,
      );

      for (const [band, dealIds] of plan) {
        result.stale += dealIds.length;
        result.byBand[band] = (result.byBand[band] ?? 0) + dealIds.length;
        if (!input.apply) {
          continue;
        }
        for (
          let start = 0;
          start < dealIds.length;
          start += BAND_REFRESH_UPDATE_CHUNK
        ) {
          const chunk = dealIds.slice(start, start + BAND_REFRESH_UPDATE_CHUNK);
          const updateResult = await input.client
            .from("deal_previews")
            .update({ deadline_band: band })
            .in("deal_id", chunk)
            .eq("is_published", true)
            .select("deal_id, is_published");
          if (updateResult.error) {
            throw new Error("deadline band refresh failed");
          }
          const updatedRows = updateResult.data ?? [];
          result.updated += updatedRows.length;
          for (const row of updatedRows) {
            if (!row.is_published) {
              result.unpublishedByGate += 1;
            }
          }
        }
      }

      if (previews.length < BAND_REFRESH_PAGE_SIZE) {
        break;
      }
      after = previews[previews.length - 1]!.deal_id;
    }
  } catch {
    throw new Error("deadline band refresh failed");
  }

  return result;
}
