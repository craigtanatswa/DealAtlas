import { describe, expect, it } from "vitest";

import {
  HEALTH_FAILURE_THRESHOLD,
  healthDisableReason,
  runExpiryJob,
  runHealthJob,
} from "@/lib/jobs/discovery";

describe("private discovery jobs", () => {
  it("expires pending and approved opportunity candidates past their deadline", async () => {
    const filters: unknown[][] = [];
    let patch: Record<string, unknown> | null = null;
    const client = {
      from(table: string) {
        expect(table).toBe("opportunity_candidates");
        return {
          update(value: Record<string, unknown>) {
            patch = value;
            const chain = {
              lt(column: string, value: string) {
                filters.push(["lt", column, value]);
                return chain;
              },
              in(column: string, values: string[]) {
                filters.push(["in", column, values]);
                return chain;
              },
              async select() {
                return { data: [{ id: "candidate-1" }, { id: "candidate-2" }], error: null };
              },
            };
            return chain;
          },
        };
      },
    };
    const now = new Date("2027-04-01T00:00:00.000Z");

    const result = await runExpiryJob({
      client: client as never,
      now,
    });

    expect(result.expired).toBe(2);
    expect(patch).toMatchObject({
      status: "EXPIRED",
      reject_reason: "Opportunity deadline has passed",
    });
    expect(filters).toContainEqual(["lt", "deadline", now.toISOString()]);
    expect(filters).toContainEqual([
      "in",
      "status",
      ["PENDING_REVIEW", "APPROVED"],
    ]);
  });

  it("auto-disables a source after repeated failures and leaves healthy sources alone", async () => {
    const rows = [
      {
        id: "source-bad",
        source_key: "seed-bad",
        enabled: true,
        consecutive_failures: HEALTH_FAILURE_THRESHOLD,
        reliability_score: 20,
        last_error: "HTTP_403",
      },
      {
        id: "source-good",
        source_key: "seed-good",
        enabled: true,
        consecutive_failures: 0,
        reliability_score: 100,
        last_error: null,
      },
    ];
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const client = {
      from(table: string) {
        expect(table).toBe("data_sources");
        return {
          select() {
            return {
              async eq() {
                return { data: rows, error: null };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              async eq(_column: string, id: string) {
                updates.push({ id, patch });
                return { error: null };
              },
            };
          },
        };
      },
    };

    const result = await runHealthJob({ client: client as never });

    expect(result.checked).toBe(2);
    expect(result.disabled).toBe(1);
    expect(result.sources).toEqual(["seed-bad"]);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("source-bad");
    expect(updates[0].patch.enabled).toBe(false);
    expect(healthDisableReason(rows[1])).toBeNull();
  });
});
