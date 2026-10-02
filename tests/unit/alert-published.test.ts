import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadPublishedAlertPreviews } from "@/lib/alerts/published";

function fakeAdmin(rows: unknown[]) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    select(columns: string) {
      calls.push(["select", columns]);
      return query;
    },
    in(column: string, values: unknown[]) {
      calls.push(["in", column, values]);
      return query;
    },
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return query;
    },
    then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  const admin = {
    from(table: string) {
      calls.push(["from", table]);
      return query;
    },
  };
  return { admin, calls };
}

describe("published alert previews", () => {
  it("only reads previews that are published, LOW risk and not held", async () => {
    const { admin, calls } = fakeAdmin([
      {
        deal_id: "c1000000-0000-4000-8000-000000000001",
        slug: "winter-road-treatment-vehicles-c1000000",
        preview_title: "Winter road treatment vehicles",
        preview_summary: "A public body needs a supplier for road treatment vehicles.",
        deadline_band: null,
        value_band: null,
        main_category: null,
        broad_region: "East of England",
      },
    ]);
    const previews = await loadPublishedAlertPreviews(
      admin as never,
      ["c1000000-0000-4000-8000-000000000001", null],
    );

    expect(calls).toContainEqual(["from", "deal_previews"]);
    expect(calls).toContainEqual(["eq", "is_published", true]);
    expect(calls).toContainEqual(["eq", "leakage_risk", "LOW"]);
    expect(calls).toContainEqual(["eq", "unpublished_by_admin", false]);
    expect(previews.get("c1000000-0000-4000-8000-000000000001")?.previewTitle).toBe(
      "Winter road treatment vehicles",
    );
  });

  it("does not query when there are no deal ids", async () => {
    const { admin, calls } = fakeAdmin([]);
    expect((await loadPublishedAlertPreviews(admin as never, [null])).size).toBe(0);
    expect(calls).toEqual([]);
  });
});
