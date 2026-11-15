import {
  deadlineBandFromDeadline,
  rewriteClosingWindow,
  rewriteClosingWindowInRequirements,
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
  preview_summary: string | null;
  requirements_preview: unknown;
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

type PreviewUpdateByDealQuery = {
  eq: (column: string, value: boolean) => {
    select: (columns: string) => QueryResult<UpdatedPreviewRow>;
  };
};

type PreviewUpdateQuery = {
  in: (column: string, values: readonly string[]) => PreviewUpdateByDealQuery;
  eq: (column: string, value: string) => PreviewUpdateByDealQuery;
};

type PreviewUpdateValues = {
  deadline_band: DeadlineBand;
  preview_summary?: string;
  requirements_preview?: unknown[];
};

export type BandRefreshClient = {
  from(table: "deal_previews"): {
    select: (columns: string) => PreviewListQuery;
    update: (values: PreviewUpdateValues) => PreviewUpdateQuery;
  };
  from(table: "deals"): {
    select: (columns: string) => DealListQuery;
  };
};

export type BandRefreshResult = {
  scanned: number;
  stale: number;
  updated: number;
  textRewritten: number;
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

type PreviewRefreshInput = {
  dealId: string;
  stored: string | null;
  previewSummary: string | null;
  requirementsPreview: unknown;
  deadline: string | null;
  status: string | null;
};

type TextUpdate = {
  dealId: string;
  band: DeadlineBand;
  previewSummary?: string;
  requirementsPreview?: unknown[];
};

type PreviewRefreshPlan = {
  bandOnly: Map<DeadlineBand, string[]>;
  textUpdates: TextUpdate[];
  stale: number;
  byBand: Record<string, number>;
};

function planPreviewRefresh(
  rows: PreviewRefreshInput[],
  now: Date,
): PreviewRefreshPlan {
  const plan: PreviewRefreshPlan = {
    bandOnly: new Map<DeadlineBand, string[]>(),
    textUpdates: [],
    stale: 0,
    byBand: {},
  };
  for (const row of rows) {
    const band = liveDeadlineBand({
      deadline: row.deadline,
      status: row.status,
      now,
    });
    if (!band) {
      continue;
    }

    const summary =
      typeof row.previewSummary === "string" ? row.previewSummary : null;
    const requirements = Array.isArray(row.requirementsPreview)
      ? row.requirementsPreview
      : null;
    const nextSummary =
      summary === null ? null : rewriteClosingWindow(summary, band);
    const nextRequirements =
      requirements === null
        ? null
        : requirements.map((item) =>
            typeof item === "string"
              ? rewriteClosingWindowInRequirements([item], band)[0]
              : item,
          );
    const summaryChanged =
      summary !== null && nextSummary !== null && nextSummary !== summary;
    const requirementsChanged =
      requirements !== null &&
      nextRequirements !== null &&
      nextRequirements.some((item, index) => item !== requirements[index]);
    const textChanged = summaryChanged || requirementsChanged;
    const bandChanged = band !== row.stored;
    if (!bandChanged && !textChanged) {
      continue;
    }

    plan.stale += 1;
    plan.byBand[band] = (plan.byBand[band] ?? 0) + 1;
    if (textChanged) {
      plan.textUpdates.push({
        dealId: row.dealId,
        band,
        ...(summaryChanged && nextSummary !== null
          ? { previewSummary: nextSummary }
          : {}),
        ...(requirementsChanged && nextRequirements !== null
          ? { requirementsPreview: nextRequirements }
          : {}),
      });
      continue;
    }
    const ids = plan.bandOnly.get(band);
    if (ids) {
      ids.push(row.dealId);
    } else {
      plan.bandOnly.set(band, [row.dealId]);
    }
  }
  return plan;
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
    textRewritten: 0,
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
        .select("deal_id, deadline_band, preview_summary, requirements_preview")
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
      const plan = planPreviewRefresh(
        previews.map((preview) => {
          const deal = dealsById.get(preview.deal_id);
          return {
            dealId: preview.deal_id,
            stored: preview.deadline_band,
            previewSummary: preview.preview_summary,
            requirementsPreview: preview.requirements_preview,
            deadline: deal?.submission_deadline ?? null,
            status: deal?.status ?? null,
          };
        }),
        now,
      );

      result.stale += plan.stale;
      for (const [band, count] of Object.entries(plan.byBand)) {
        result.byBand[band] = (result.byBand[band] ?? 0) + count;
      }
      if (input.apply) {
        for (const [band, dealIds] of plan.bandOnly) {
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

        for (const update of plan.textUpdates) {
          const updateResult = await input.client
            .from("deal_previews")
            .update({
              deadline_band: update.band,
              ...(update.previewSummary !== undefined
                ? { preview_summary: update.previewSummary }
                : {}),
              ...(update.requirementsPreview !== undefined
                ? { requirements_preview: update.requirementsPreview }
                : {}),
            })
            .eq("deal_id", update.dealId)
            .eq("is_published", true)
            .select("deal_id, is_published");
          if (updateResult.error) {
            throw new Error("deadline band refresh failed");
          }
          const updatedRows = updateResult.data ?? [];
          result.updated += updatedRows.length;
          result.textRewritten += updatedRows.length;
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
