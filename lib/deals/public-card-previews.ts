import "server-only";

import { expandFilterToRawCategories } from "@/lib/categories/filter-map";
import { throwIfQueryError } from "@/lib/db/errors";
import type { PublicSupabaseClient } from "@/lib/db/previews";
import {
  PUBLIC_CARD_PREVIEW_COLUMNS,
  PUBLIC_CARD_PREVIEW_KEYS,
  type PublicCardPreview,
} from "@/lib/deals/public-card-types";
import { disclosed } from "@/lib/preview/display";

export { PUBLIC_CARD_PREVIEW_COLUMNS, PUBLIC_CARD_PREVIEW_KEYS };
export type { PublicCardPreview };

type CardStatus = "OPEN" | "CLOSING_SOON" | "UPCOMING";

const RELATED_STATUSES: Array<"OPEN" | "CLOSING_SOON"> = ["OPEN", "CLOSING_SOON"];

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Explicitly pick the six public card fields; never spread the source row. */
export function toPublicCardPreview(
  row: Record<string, unknown> | null | undefined,
): PublicCardPreview | null {
  if (!row) {
    return null;
  }

  const slug = typeof row.slug === "string" ? row.slug.trim() : "";
  const previewTitle =
    typeof row.preview_title === "string" ? row.preview_title.trim() : "";
  if (!slug || !previewTitle) {
    return null;
  }

  return {
    slug,
    previewTitle,
    mainCategory: stringOrNull(row.main_category),
    broadRegion: stringOrNull(row.broad_region),
    valueBand: stringOrNull(row.value_band),
    deadlineBand: stringOrNull(row.deadline_band),
  };
}

export async function listPublicCardPreviews(
  client: PublicSupabaseClient,
  input: {
    category?: string;
    region?: string;
    statuses?: CardStatus[];
    query?: string;
    limit: number;
    excludeSlug?: string;
  },
): Promise<PublicCardPreview[]> {
  const limit = Math.min(50, Math.max(1, Math.trunc(input.limit || 1)));
  const rawCategories = input.category
    ? expandFilterToRawCategories(input.category)
    : [];
  const requestLimit = limit + (input.excludeSlug ? 1 : 0);

  const { data, error } = await client
    .rpc("search_preview_dtos", {
      p_category: rawCategories.length === 1 ? rawCategories[0] : undefined,
      p_categories: rawCategories.length > 1 ? rawCategories : undefined,
      p_region: input.region,
      p_statuses: input.statuses,
      p_query: input.query || undefined,
      p_sort: "biddable",
      p_limit: requestLimit,
      p_offset: 0,
    })
    .select(PUBLIC_CARD_PREVIEW_COLUMNS.join(","));

  const rows = throwIfQueryError("Failed to list public card previews", {
    data: (data ?? []) as unknown as Array<Record<string, unknown>>,
    error,
  });

  return rows
    .map(toPublicCardPreview)
    .filter((preview): preview is PublicCardPreview => preview !== null)
    .filter((preview) => preview.slug !== input.excludeSlug)
    .slice(0, limit);
}

export async function listRelatedDealPreviews(
  client: PublicSupabaseClient,
  deal: {
    slug: string;
    mainCategory: string | null;
    broadRegion: string | null;
  },
  max = 6,
): Promise<PublicCardPreview[]> {
  const cap = Math.min(50, Math.max(1, Math.trunc(max) || 1));
  const picked: PublicCardPreview[] = [];
  const seen = new Set<string>([deal.slug]);

  const add = (previews: PublicCardPreview[]) => {
    for (const preview of previews) {
      if (picked.length >= cap) return;
      if (seen.has(preview.slug)) continue;
      seen.add(preview.slug);
      picked.push(preview);
    }
  };

  if (deal.mainCategory) {
    add(
      await listPublicCardPreviews(client, {
        category: deal.mainCategory,
        statuses: [...RELATED_STATUSES],
        limit: cap,
        excludeSlug: deal.slug,
      }),
    );
  }

  const region = disclosed(deal.broadRegion);
  if (region && picked.length < cap) {
    add(
      await listPublicCardPreviews(client, {
        region,
        statuses: [...RELATED_STATUSES],
        limit: cap,
        excludeSlug: deal.slug,
      }),
    );
  }

  return picked.slice(0, cap);
}
