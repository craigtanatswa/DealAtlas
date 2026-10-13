import { describe, expect, it } from "vitest";

import { createSupabaseIngestionStore } from "@/ingestion/store/supabase";
import type { IngestionSupabaseClient } from "@/ingestion/store/worker-client";

function dealId(index: number): string {
  return `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`;
}

describe("listDealIdsMissingPreview", () => {
  it("looks up preview ids in short chunks so the GET URL stays small", async () => {
    const total = 600;
    const missingIds = new Set([dealId(510), dealId(520), dealId(599)]);
    const batches: number[] = [];
    const pages: number[] = [];

    function dealsResult(after: string | null) {
      const start = after == null ? 0 : Number(after.slice(0, 8)) + 1;
      const rows = [];
      for (let index = start; index < Math.min(total, start + 500); index += 1) {
        rows.push({ id: dealId(index) });
      }
      pages.push(rows.length);
      return { data: rows, error: null };
    }

    const client = {
      from(table: string) {
        if (table === "deals") {
          let after: string | null = null;
          const chain = {
            select() {
              return chain;
            },
            order() {
              return chain;
            },
            limit() {
              return chain;
            },
            gt(_column: string, value: string) {
              after = value;
              return chain;
            },
            then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
              return Promise.resolve(dealsResult(after)).then(resolve, reject);
            },
          };
          return chain;
        }
        return {
          select() {
            return this;
          },
          in(_column: string, ids: string[]) {
            batches.push(ids.length);
            if (ids.length > 100) {
              return Promise.resolve({
                data: null,
                error: { message: "TypeError: fetch failed", code: "" },
              });
            }
            return Promise.resolve({
              data: ids
                .filter((id) => !missingIds.has(id))
                .map((deal_id) => ({ deal_id })),
              error: null,
            });
          },
        };
      },
    };

    const store = createSupabaseIngestionStore(client as unknown as IngestionSupabaseClient);
    await expect(store.listDealIdsMissingPreview()).resolves.toEqual([...missingIds].sort());
    expect(pages).toEqual([500, 100]);
    expect(batches.length).toBeGreaterThan(1);
    expect(Math.max(...batches)).toBeLessThanOrEqual(100);
  });
});
