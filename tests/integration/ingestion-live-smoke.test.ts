import { describe, expect, it } from "vitest";

import { runIngestion } from "@/ingestion/core/pipeline";
import { createFindATenderAdapter } from "@/ingestion/sources/find-a-tender/adapter";
import { FIND_A_TENDER_SOURCE_KEY } from "@/ingestion/sources/find-a-tender/constants";
import {
  createIngestionSupabaseClient,
  createSupabaseIngestionStore,
} from "@/ingestion/store";

const live = process.env.INGEST_LIVE_SMOKE === "1";

describe.skipIf(!live)("Find a Tender live smoke", () => {
  it("imports real official OCDS records without duplicating a second unchanged run", async () => {
    const store = createSupabaseIngestionStore(createIngestionSupabaseClient());
    const adapter = createFindATenderAdapter({ defaultLookbackHours: 12 });
    const first = await runIngestion({
      sourceKey: FIND_A_TENDER_SOURCE_KEY,
      store,
      adapter,
      limit: 2,
      triggerType: "LIVE_SMOKE",
    });

    expect(["SUCCEEDED", "PARTIAL"]).toContain(first.status);
    expect(first.counters.fetched).toBeGreaterThan(0);
    expect(first.counters.new + first.counters.updated + first.counters.unchanged).toBeGreaterThan(0);

    const second = await runIngestion({
      sourceKey: FIND_A_TENDER_SOURCE_KEY,
      store,
      adapter,
      limit: 2,
      triggerType: "LIVE_SMOKE",
      updatedFrom: undefined,
    });
    expect(second.counters.unchanged).toBeGreaterThan(0);
  }, 60_000);
});
