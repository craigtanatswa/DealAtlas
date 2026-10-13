import { describe, expect, it } from "vitest";

import { writeInBatches } from "@/ingestion/store/write-batch";

describe("writeInBatches", () => {
  it("writes 50-row chunks and retries a failed chunk one row at a time", async () => {
    const many: number[][] = [];
    const one: number[] = [];
    const rows = Array.from({ length: 51 }, (_, index) => index);
    await writeInBatches(
      rows,
      async (chunk) => {
        many.push(chunk);
        if (chunk.includes(10)) throw new Error("batch rejected");
      },
      async (row) => {
        if (row === 10) throw new Error("row rejected");
        one.push(row);
      },
    ).catch((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
    });

    expect(many[0]).toHaveLength(50);
    expect(one).not.toContain(10);
    expect(one).toContain(0);
    expect(one).toContain(49);
    expect(one).not.toContain(50);
  });
});
