import { describe, expect, it } from "vitest";

import { IngestionError } from "@/ingestion/core/errors";
import { withRetry } from "@/ingestion/core/retry";

describe("ingestion retry/backoff", () => {
  it("retries retryable failures with exponential backoff then succeeds", async function () {
    const delays: number[] = [];
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new IngestionError({
            message: "transient",
            stage: "fetch",
            code: "HTTP_503",
            retryable: true,
          });
        }
        return "ok";
      },
      {
        maxAttempts: 4,
        baseDelayMs: 10,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(delays[0]).toBeGreaterThanOrEqual(5);
    expect(delays[0]).toBeLessThanOrEqual(10);
    expect(delays[1]).toBeGreaterThanOrEqual(10);
    expect(delays[1]).toBeLessThanOrEqual(20);
  });

  it("retries a network failure five times and jitters the backoff", async () => {
    const delays: number[] = [];
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new IngestionError({
            message: "ETIMEDOUT fetching www.find-tender.service.gov.uk",
            stage: "fetch",
            code: "HTTP_NETWORK",
            retryable: true,
          });
        },
        {
          baseDelayMs: 100,
          maxDelayMs: 1_000,
          random: () => 0,
          sleep: async (ms) => {
            delays.push(ms);
          },
        },
      ),
    ).rejects.toMatchObject({ code: "HTTP_NETWORK" });
    expect(attempts).toBe(5);
    expect(delays).toEqual([50, 100, 200, 400]);
  });

  it("does not retry 4xx access restrictions", async () => {
    let attempts = 0;
    await expect(
      withRetry(async () => {
        attempts += 1;
        throw new IngestionError({
          message: "forbidden",
          stage: "fetch",
          code: "HTTP_403",
          retryable: false,
        });
      }),
    ).rejects.toMatchObject({ code: "HTTP_403" });
    expect(attempts).toBe(1);
  });
});
