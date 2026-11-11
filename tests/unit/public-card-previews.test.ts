import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { expandFilterToRawCategories } from "@/lib/categories/filter-map";
import type { PublicSupabaseClient } from "@/lib/db/previews";
import {
  listPublicCardPreviews,
  listRelatedDealPreviews,
  PUBLIC_CARD_PREVIEW_COLUMNS,
  PUBLIC_CARD_PREVIEW_KEYS,
  toPublicCardPreview,
} from "@/lib/deals/public-card-previews";

type Row = Record<string, unknown>;
type RpcCall = {
  name: string;
  args: Record<string, unknown>;
  columns: string;
};

function cardRow(slug: string, overrides: Row = {}): Row {
  return {
    slug,
    preview_title: `Title for ${slug}`,
    main_category: "Construction & Infrastructure",
    broad_region: "Wales",
    value_band: "£250k–£500k",
    deadline_band: "Within 3 weeks",
    buyer_name: "CANARY BUYER",
    source_url: "https://canary.example/notice",
    preview_summary: "CANARY SUMMARY",
    status: "OPEN",
    reference: "CANARY-REF",
    total_count: 99,
    deal_id: "22222222-2222-4222-8222-222222222222",
    ...overrides,
  };
}

function createClient(
  rowsForCall: (callIndex: number, args: Record<string, unknown>) => Row[],
) {
  const calls: RpcCall[] = [];
  let callIndex = 0;
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => ({
    select: vi.fn((columns: string) => {
      calls.push({ name, args, columns });
      const data = rowsForCall(callIndex, args);
      callIndex += 1;
      return Promise.resolve({ data, error: null });
    }),
  }));

  return {
    client: { rpc } as unknown as PublicSupabaseClient,
    calls,
  };
}

describe("public card previews", () => {
  it("selects only the six public columns and never spreads forbidden fields", async () => {
    const { client, calls } = createClient(() => [
      cardRow("open-construction-deal"),
      cardRow("missing-title", { preview_title: null }),
      cardRow("", { slug: "" }),
    ]);

    const previews = await listPublicCardPreviews(client, {
      category: "Construction & Infrastructure",
      limit: 24,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("search_preview_dtos");
    expect(calls[0]?.columns).toBe(PUBLIC_CARD_PREVIEW_COLUMNS.join(","));
    expect(calls[0]?.columns).toBe(
      "slug,preview_title,main_category,broad_region,value_band,deadline_band",
    );
    expect(calls[0]?.args.p_sort).toBe("biddable");
    expect(calls[0]?.args.p_limit).toBe(24);
    expect(calls[0]?.args.p_offset).toBe(0);
    expect(calls[0]?.args.p_categories).toEqual(
      expandFilterToRawCategories("Construction & Infrastructure"),
    );

    expect(previews).toHaveLength(1);
    expect(Object.keys(previews[0]!).sort()).toEqual(
      [...PUBLIC_CARD_PREVIEW_KEYS].sort(),
    );
    expect(previews[0]).toEqual({
      slug: "open-construction-deal",
      previewTitle: "Title for open-construction-deal",
      mainCategory: "Construction & Infrastructure",
      broadRegion: "Wales",
      valueBand: "£250k–£500k",
      deadlineBand: "Within 3 weeks",
    });
    expect(previews[0]).not.toHaveProperty("buyer_name");
    expect(previews[0]).not.toHaveProperty("source_url");
    expect(previews[0]).not.toHaveProperty("preview_summary");
    expect(previews[0]).not.toHaveProperty("status");
    expect(previews[0]).not.toHaveProperty("reference");
    expect(previews[0]).not.toHaveProperty("total_count");
    expect(previews[0]).not.toHaveProperty("deal_id");
  });

  it("drops the excluded slug and clamps the limit", async () => {
    const { client, calls } = createClient(() => [
      cardRow("current-deal"),
      cardRow("next-deal"),
    ]);

    const previews = await listPublicCardPreviews(client, {
      limit: 500,
      excludeSlug: "current-deal",
    });

    expect(calls[0]?.args.p_limit).toBe(51);
    expect(previews.map((preview) => preview.slug)).toEqual(["next-deal"]);
  });

  it("builds related deals from the same category first, then a disclosed region, deduped", async () => {
    const current = "current-deal";
    const sameCategory = [
      cardRow(current),
      cardRow("category-deal-1"),
      cardRow("category-deal-2"),
    ];
    const sameRegion = [
      cardRow("category-deal-1"),
      cardRow("category-deal-2"),
      cardRow("region-deal-1"),
      cardRow("region-deal-2"),
      cardRow("region-deal-3"),
      cardRow("region-deal-4"),
      cardRow("region-deal-5"),
    ];
    const { client, calls } = createClient((index) =>
      index === 0 ? sameCategory : sameRegion,
    );

    const related = await listRelatedDealPreviews(client, {
      slug: current,
      mainCategory: "Construction & Infrastructure",
      broadRegion: "Wales",
    });

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.args.p_statuses).toEqual(["OPEN", "CLOSING_SOON"]);
    }
    expect(calls[0]?.args.p_categories).toEqual(
      expandFilterToRawCategories("Construction & Infrastructure"),
    );
    expect(calls[1]?.args.p_region).toBe("Wales");
    expect(related.map((preview) => preview.slug)).toEqual([
      "category-deal-1",
      "category-deal-2",
      "region-deal-1",
      "region-deal-2",
      "region-deal-3",
      "region-deal-4",
    ]);
    expect(related).toHaveLength(6);
    expect(new Set(related.map((preview) => preview.slug)).size).toBe(
      related.length,
    );
    expect(related.map((preview) => preview.slug)).not.toContain(current);
  });

  it("skips the region fill when the region is a placeholder", async () => {
    const { client, calls } = createClient(() => [cardRow("category-deal-1")]);

    const related = await listRelatedDealPreviews(client, {
      slug: "current-deal",
      mainCategory: "Construction & Infrastructure",
      broadRegion: "Not disclosed",
    });

    expect(calls).toHaveLength(1);
    expect(related.map((preview) => preview.slug)).toEqual([
      "category-deal-1",
    ]);
  });

  it("picks only the six public keys from a snake_case row", () => {
    const preview = toPublicCardPreview(cardRow("single-deal"));

    expect(preview).not.toBeNull();
    expect(Object.keys(preview!).sort()).toEqual(
      [...PUBLIC_CARD_PREVIEW_KEYS].sort(),
    );
  });
});
