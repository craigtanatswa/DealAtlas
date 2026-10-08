import { describe, expect, it } from "vitest";

import { IngestionError } from "@/ingestion/core/errors";
import { retryAfterToMs, withRetry } from "@/ingestion/core/retry";
import { createRequestPacer } from "@/ingestion/sources/find-a-tender/pace";

describe("Find a Tender request pacing", () => {
  it("waits out the window instead of sending the next request early", async () => {
    let clock = 0;
    const delays: number[] = [];
    const pace = createRequestPacer({
      maxRequests: 2,
      windowMs: 1_000,
      now: () => clock,
      sleep: async (ms) => {
        delays.push(ms);
        clock += ms;
      },
    });

    await pace();
    await pace();
    await pace();

    expect(delays).toEqual([1_000]);
  });

  it("honours a 120 second Retry-After", async () => {
    expect(retryAfterToMs("120")).toBe(120_000);
    const delays: number[] = [];
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new IngestionError({
            message: "slow down",
            stage: "fetch",
            code: "HTTP_429",
            retryable: true,
            details: { retryAfterMs: retryAfterToMs("120") },
          });
        }
        return "ok";
      },
      {
        maxAttempts: 3,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );

    expect(result).toBe("ok");
    expect(delays).toEqual([120_000]);
  });
});
