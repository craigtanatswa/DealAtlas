import { describe, expect, it } from "vitest";

import { runIngestion } from "@/ingestion/core/pipeline";
import { canIngestSource } from "@/ingestion/core/compliance";
import { createUkInfrastructurePipelineAdapter } from "@/ingestion/sources/uk-infrastructure-pipeline/adapter";
import { NISTA_LAYOUT_API } from "@/ingestion/sources/uk-infrastructure-pipeline/constants";
import { ukInfrastructurePipelineSourceRecord } from "@/ingestion/sources/uk-infrastructure-pipeline/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import {
  createFixtureHttpClient,
  readUkInfrastructureFixture,
} from "@/tests/helpers/ingestion-fixtures";

const NOW = new Date("2026-09-14T12:00:00.000Z");

function ingest(layout: unknown, store = createMemoryIngestionStore({
  sources: [ukInfrastructurePipelineSourceRecord({ id: "source-ukip" })],
})) {
  const adapter = createUkInfrastructurePipelineAdapter({
    httpJson: createFixtureHttpClient(() => layout),
    now: () => NOW,
  });
  return {
    store,
    result: runIngestion({
      sourceKey: "uk-infrastructure-pipeline",
      store,
      adapter,
      now: NOW,
      limit: 20,
      triggerType: "TEST",
    }),
  };
}

describe("UK Infrastructure Pipeline fixture ingestion", () => {
  it("is allowed by the compliance gate", () => {
    expect(canIngestSource(ukInfrastructurePipelineSourceRecord())).toEqual({
      allowed: true,
    });
  });

  it("creates canonical pipeline deals with provenance from the layout fixture", async () => {
    const { store, result } = ingest(readUkInfrastructureFixture("layout.json"));
    const outcome = await result;

    expect(outcome.status).toBe("PARTIAL");
    expect(outcome.counters.new).toBe(3);
    expect(outcome.counters.errorCount).toBe(1);
    expect(store.deals).toHaveLength(3);
    expect(store.errors[0]?.externalRecordId).toBe("not-enough-fields");

    const reservoir = store.deals.find((deal) =>
      deal.sourceTitle.includes("North Suffolk Reservoir"),
    );
    expect(reservoir?.dealType).toBe("PRIVATE_TENDER");
    expect(reservoir?.stage).toBe("LIVE");
    expect(reservoir?.status).toBe("OPEN");
    expect(reservoir?.buyerSector).toBe("UTILITY");
    expect(reservoir?.sourceUrl).toContain(NISTA_LAYOUT_API.split("/_dash-layout")[0]);
    expect(reservoir?.ocid).toMatch(/^da-uk-infrastructure-pipeline-/);
    expect(reservoir?.sourceTitle).toBe("North Suffolk Reservoir");
    expect(store.organizations.some((org) => org.canonicalName === "Northumbrian Water")).toBe(
      true,
    );
    expect(store.notices).toHaveLength(3);
  });

  it("does not duplicate unchanged data on rerun", async () => {
    const first = ingest(readUkInfrastructureFixture("layout.json"));
    await first.result;
    const second = ingest(readUkInfrastructureFixture("layout.json"), first.store);
    const rerun = await second.result;

    expect(rerun.counters.unchanged).toBe(3);
    expect(rerun.counters.new).toBe(0);
    expect(first.store.deals).toHaveLength(3);
  });

  it("fetches the official layout payload once while paging", async () => {
    let calls = 0;
    const layout = readUkInfrastructureFixture("layout.json");
    const adapter = createUkInfrastructurePipelineAdapter({
      httpJson: {
        async getJson(url: string) {
          calls += 1;
          return {
            url,
            status: 200,
            contentType: "application/json",
            body: layout,
            rawText: JSON.stringify(layout),
          };
        },
      },
      now: () => NOW,
    });
    const first = await adapter.discover(undefined, { limit: 1 });
    const second = await adapter.discover(first.nextCursor, { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(first.items[0]?.externalRecordId).not.toBe(second.items[0]?.externalRecordId);
    expect(calls).toBe(1);
  });

  it("records material changes when a programme is updated", async () => {
    const first = ingest(readUkInfrastructureFixture("layout.json"));
    await first.result;
    const updatedLayout = {
      props: {
        children: [
          {
            props: {
              data: [readUkInfrastructureFixture("updated.json")],
            },
          },
        ],
      },
    };
    const second = ingest(updatedLayout, first.store);
    const updated = await second.result;

    expect(updated.counters.updated + updated.counters.new).toBeGreaterThan(0);
    const reservoir = first.store.deals.find((deal) =>
      deal.sourceTitle.includes("North Suffolk Reservoir"),
    );
    expect(reservoir?.valueMaxExVat).toBe(810000000);
    expect(
      first.store.dataChanges.some((change) => change.changeType === "value_change"),
    ).toBe(true);
  });
});

describe("private-source compliance blocks", () => {
  it("skips UNKNOWN and PROHIBITED private sources before fetch", async () => {
    const unknownStore = createMemoryIngestionStore({
      sources: [
        ukInfrastructurePipelineSourceRecord({
          id: "unknown",
          sourceKey: "hs2-direct-contract-opportunities",
          enabled: true,
          reuseStatus: "UNKNOWN",
          accessMethod: "HTML",
          scrapingPermitted: false,
          licenceName: null,
          licenceUrl: null,
          termsUrl: null,
        }),
      ],
    });
    const unknown = await runIngestion({
      sourceKey: "hs2-direct-contract-opportunities",
      store: unknownStore,
      adapter: createUkInfrastructurePipelineAdapter({
        httpJson: createFixtureHttpClient(() => ({})),
        now: () => NOW,
      }),
      now: NOW,
    });
    expect(unknown.status).toBe("SKIPPED");
    expect(unknown.errors[0]?.code).toBe("REUSE_UNKNOWN");

    const prohibitedStore = createMemoryIngestionStore({
      sources: [
        ukInfrastructurePipelineSourceRecord({
          id: "prohibited",
          sourceKey: "competefor",
          enabled: true,
          reuseStatus: "PROHIBITED",
          accessMethod: "HTML",
          scrapingPermitted: false,
        }),
      ],
    });
    const prohibited = await runIngestion({
      sourceKey: "competefor",
      store: prohibitedStore,
      adapter: createUkInfrastructurePipelineAdapter({
        httpJson: createFixtureHttpClient(() => ({})),
        now: () => NOW,
      }),
      now: NOW,
    });
    expect(prohibited.status).toBe("SKIPPED");
    expect(prohibited.errors[0]?.code).toBe("REUSE_PROHIBITED");
  });
});
