import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const search = vi.fn(async () => []);
vi.mock("@/lib/db/previews", async (orig) => ({
  ...(await orig<typeof import("@/lib/db/previews")>()),
  searchPublishedDealPreviews: (...args: unknown[]) => search(...(args as [])),
}));

import { searchPublicDealPreviewsFromParams } from "@/lib/search/public";

describe("public /api/search ordering", () => {
  it("never forwards sort=relevance to the RPC", async () => {
    const { filters } = await searchPublicDealPreviewsFromParams({} as never, {
      sort: "relevance",
      minScore: "90",
    });
    expect(filters.sort).toBeUndefined();
    const args = search.mock.calls[0] as unknown as [unknown, { sort?: string }];
    expect(args[1].sort).toBeUndefined();
  });
});
