import { describe, expect, it, vi } from "vitest";

import { expandFilterToRawCategories } from "@/lib/categories/filter-map";
import { searchPublishedDealPreviews, type PublicSupabaseClient } from "@/lib/db/previews";

describe("multi-raw category search", () => {
  it("uses one RPC call and keeps the RPC's updated_at order instead of re-sorting by slug", async () => {
    const rpcOrder = [
      { slug: "z-deal", status: "OPEN", updated_at: "2026-10-27T12:00:00Z" },
      { slug: "a-deal", status: "OPEN", updated_at: "2026-10-26T12:00:00Z" },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: rpcOrder, error: null });
    const client = { rpc } as unknown as PublicSupabaseClient;

    const rows = await searchPublishedDealPreviews(client, {
      category: "Energy & Utilities",
      sort: "updated",
    });

    const energyRaws = expandFilterToRawCategories("Energy & Utilities");
    expect(energyRaws).toHaveLength(3);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[0]).toBe("search_preview_dtos");

    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args.p_categories).toEqual(energyRaws);
    expect(args.p_category ?? null).toBeNull();
    expect(args.p_sort).toBe("updated");

    expect(rows.map((row) => row.slug)).toEqual(["z-deal", "a-deal"]);
    expect(rows.map((row) => row.slug)).not.toEqual(["a-deal", "z-deal"]);
  });
});
