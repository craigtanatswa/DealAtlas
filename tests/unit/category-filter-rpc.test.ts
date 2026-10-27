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

  it("falls back to per-raw p_category fan-out when p_categories is missing", async () => {
    const rpc = vi.fn().mockImplementation((_name: string, args: Record<string, unknown>) => {
      if (args.p_categories) {
        return Promise.resolve({
          data: null,
          error: {
            code: "PGRST202",
            message:
              "Could not find the function public.search_preview_dtos(p_categories) in the schema cache",
          },
        });
      }

      const rawCategory = args.p_category as string;
      return Promise.resolve({
        data: [
          {
            slug: `${rawCategory.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-deal`,
            status: "OPEN",
            updated_at: "2026-10-27T12:00:00Z",
          },
        ],
        error: null,
      });
    });
    const client = { rpc } as unknown as PublicSupabaseClient;

    const rows = await searchPublishedDealPreviews(client, {
      category: "Energy & Utilities",
      sort: "updated",
    });

    const energyRaws = expandFilterToRawCategories("Energy & Utilities");
    expect(energyRaws).toHaveLength(3);
    expect(rpc).toHaveBeenCalledTimes(1 + energyRaws.length);

    const fanoutArgs = rpc.mock.calls
      .slice(1)
      .map((call) => call[1] as Record<string, unknown>);
    expect(fanoutArgs.map((args) => args.p_category)).toEqual(
      expect.arrayContaining(energyRaws),
    );
    for (const args of fanoutArgs) {
      expect(args.p_categories ?? null).toBeNull();
    }

    expect(rows).toHaveLength(energyRaws.length);
  });
});
