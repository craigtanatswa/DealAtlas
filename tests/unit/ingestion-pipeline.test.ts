import { describe, expect, it } from "vitest";

import { runIngestion } from "@/ingestion/core/pipeline";
import { createFindATenderAdapter } from "@/ingestion/sources/find-a-tender/adapter";
import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import {
  createFixtureHttpClient,
  packageFromFixtures,
} from "@/tests/helpers/ingestion-fixtures";

const NOW = new Date("2026-09-10T12:00:00.000Z");

function ingest(fixtureNames: string[], store = createMemoryIngestionStore({
  sources: [findATenderSourceRecord({ id: "source-fat" })],
})) {
  const adapter = createFindATenderAdapter({
    http: createFixtureHttpClient(() => packageFromFixtures(fixtureNames)),
    now: () => NOW,
  });
  return {
    store,
    result: runIngestion({
      sourceKey: "find-a-tender",
      store,
      adapter,
      now: NOW,
      limit: fixtureNames.length,
      triggerType: "TEST",
    }),
  };
}

function ingestPackage(body: unknown, store = createMemoryIngestionStore({
  sources: [findATenderSourceRecord({ id: "source-fat" })],
})) {
  const adapter = createFindATenderAdapter({
    http: createFixtureHttpClient(() => body),
    now: () => NOW,
  });
  return {
    store,
    result: runIngestion({
      sourceKey: "find-a-tender",
      store,
      adapter,
      now: NOW,
      limit: 100,
      triggerType: "TEST",
    }),
  };
}

type NormalRelease = {
  ocid: string;
  id: string;
  date?: string;
  tender: {
    id?: string;
    title?: string;
    mainProcurementCategory?: string;
    classification?: unknown;
    [key: string]: unknown;
  };
};

function partialUpdatePackage(
  noticeId: string,
  ocid = "ocds-h6vhtk-fixture1",
) {
  const payload = packageFromFixtures(["normal.json"]) as {
    releases: NormalRelease[];
  };
  const source = payload.releases[0]!;
  return {
    releases: [
      {
        ocid,
        id: noticeId,
        date: source.date,
        tag: ["tenderUpdate"],
        tender: {
          id: source.tender.id,
          title: `${source.tender.title ?? ""} (update)`,
          mainProcurementCategory: source.tender.mainProcurementCategory,
          classification: source.tender.classification,
          legalBasis: "regulations 2015",
          amendments: [],
        },
      },
    ],
  };
}

describe("Find a Tender fixture ingestion pipeline", () => {
  it("creates canonical deals, notices and lots from a normal fixture", async () => {
    const { store, result } = ingest(["normal.json"]);
    const outcome = await result;

    expect(outcome.status).toBe("SUCCEEDED");
    expect(outcome.counters.new).toBe(1);
    expect(store.deals).toHaveLength(1);
    expect(store.notices).toHaveLength(1);
    expect(store.lots).toHaveLength(1);
    expect(store.deals[0]?.ocid).toBe("ocds-h6vhtk-fixture1");
    expect(store.deals[0]?.sourceTitle).toContain("Managed IT support");
    expect(store.lots[0]?.sourceLotId).toBe("1");
    expect(store.requirements.length).toBeGreaterThan(0);
    expect(store.awardCriteria.length).toBeGreaterThan(0);
    expect(store.organizations[0]?.canonicalName).toBe("Example City Council");
  });

  it("does not duplicate unchanged data on rerun", async () => {
    const first = ingest(["normal.json"]);
    await first.result;
    const second = ingest(["normal.json"], first.store);
    const rerun = await second.result;

    expect(rerun.counters.unchanged).toBe(1);
    expect(rerun.counters.new).toBe(0);
    expect(first.store.deals).toHaveLength(1);
    expect(first.store.notices).toHaveLength(1);
    expect(first.store.rawRecords).toHaveLength(1);
  });

  it("records notice versions and material changes when the source record changes", async () => {
    const first = ingest(["normal.json"]);
    await first.result;
    const second = ingest(["updated.json"], first.store);
    const updated = await second.result;

    expect(updated.counters.updated + updated.counters.new).toBeGreaterThan(0);
    expect(first.store.deals).toHaveLength(1);
    expect(first.store.noticeVersions.length).toBeGreaterThanOrEqual(2);
    expect(first.store.deals[0]?.valueMaxExVat).toBe(275000);
    expect(
      first.store.dataChanges.some((change) => change.changeType === "value_change"),
    ).toBe(true);
    expect(
      first.store.dataChanges.some(
        (change) =>
          change.changeType === "deadline_extension" ||
          change.changeType === "deadline_change",
      ),
    ).toBe(true);
  });

  it("keeps known deal fields when a partial tenderUpdate has no status or periods", async () => {
    const first = ingest(["normal.json"]);
    await first.result;
    const before = { ...first.store.deals[0]! };
    expect(before.status).toBe("OPEN");

    const second = ingestPackage(
      partialUpdatePackage("000012-2026"),
      first.store,
    );
    const outcome = await second.result;

    expect(outcome.counters.errorCount).toBe(0);
    expect(first.store.deals).toHaveLength(1);
    const deal = first.store.deals[0]!;
    expect(deal.id).toBe(before.id);
    expect(deal.sourceTitle).toContain("(update)");
    expect(deal.status).toBe(before.status);
    expect(deal.submissionDeadline).toBe(before.submissionDeadline);
    expect(deal.enquiryDeadline).toBe(before.enquiryDeadline);
    expect(deal.sourceDescription).toBe(before.sourceDescription);
    expect(deal.procurementMethod).toBe(before.procurementMethod);
    expect(deal.exactLocationText).toBe(before.exactLocationText);
    expect(deal.valueMaxExVat).toBe(before.valueMaxExVat);
    expect(deal.buyerOrganizationId).toBe(before.buyerOrganizationId);
    expect(deal.smeSuitable).toBe(before.smeSuitable);
    expect(deal.vcseSuitable).toBe(before.vcseSuitable);
  });

  it("leaves a brand-new partial tenderUpdate deal UNCLASSIFIED", async () => {
    const { store, result } = ingestPackage(
      partialUpdatePackage("000013-2026", "ocds-h6vhtk-partial-only"),
    );
    const outcome = await result;

    expect(outcome.status).toBe("SUCCEEDED");
    expect(store.deals).toHaveLength(1);
    expect(store.deals[0]?.status).toBe("UNCLASSIFIED");
    expect(store.deals[0]?.submissionDeadline).toBeNull();
    expect(store.deals[0]?.valueMaxExVat).toBeNull();
  });

  it("logs malformed records without stopping the rest of the batch", async () => {
    const { store, result } = ingest(["normal.json", "malformed.json"]);
    const outcome = await result;

    expect(outcome.status).toBe("PARTIAL");
    expect(outcome.counters.new).toBe(1);
    expect(outcome.counters.errorCount).toBe(1);
    expect(store.deals).toHaveLength(1);
    expect(store.errors[0]?.errorStage).toBe("parse");
    expect(store.errors[0]?.externalRecordId).toBe("not-enough-fields");
  });

  it("imports multi-lot, withdrawn and award fixtures", async () => {
    const { store, result } = ingest([
      "multi-lot.json",
      "withdrawn.json",
      "award.json",
    ]);
    const outcome = await result;

    expect(outcome.status).toBe("SUCCEEDED");
    expect(store.deals).toHaveLength(3);
    const framework = store.deals.find((deal) => deal.ocid === "ocds-h6vhtk-fixture2");
    expect(framework?.dealType).toBe("FRAMEWORK");
    expect(store.lots.filter((lot) => lot.dealId === framework?.id)).toHaveLength(2);

    const withdrawn = store.deals.find((deal) => deal.ocid === "ocds-h6vhtk-fixture3");
    expect(withdrawn?.status).toBe("WITHDRAWN");

    const awarded = store.deals.find((deal) => deal.ocid === "ocds-h6vhtk-fixture4");
    expect(awarded?.status).toBe("AWARDED");
    expect(store.awards).toHaveLength(1);
    expect(store.contracts).toHaveLength(1);
    expect(store.awardSuppliers).toHaveLength(1);
  });

  it("skips UNKNOWN sources without fetching", async () => {
    const store = createMemoryIngestionStore({
      sources: [
        findATenderSourceRecord({
          sourceKey: "unknown-source",
          reuseStatus: "UNKNOWN",
          enabled: true,
        }),
      ],
    });
    let fetched = 0;
    const adapter = createFindATenderAdapter({
      http: {
        async getJson() {
          fetched += 1;
          throw new Error("should not fetch");
        },
      },
    });

    const outcome = await runIngestion({
      sourceKey: "unknown-source",
      store,
      adapter,
    });

    expect(outcome.status).toBe("SKIPPED");
    expect(fetched).toBe(0);
    expect(store.deals).toHaveLength(0);
  });

  it("resumes Find a Tender with the stored cursor and no new date window", async () => {
    const requested: string[] = [];
    const adapter = createFindATenderAdapter({
      http: {
        async getJson(url) {
          requested.push(url);
          return {
            url,
            status: 200,
            contentType: "application/json",
            body: packageFromFixtures(["normal.json"]),
            rawText: "{}",
          };
        },
      },
      now: () => NOW,
    });

    await adapter.discover(
      "updatedFrom=2026-09-15T09:37:39|updatedTo=2026-09-16T09:37:39|nextCursor=740122",
      { limit: 20, updatedFrom: "2026-09-15T14:36:47Z", updatedTo: "2026-09-16T14:36:47Z" },
    );
    await adapter.discover(
      "dXBkYXRlZEZyb209MjAyNi0wOS0xNVQwOTozNzozOXx1cGRhdGVkVG89MjAyNi0wOS0xNlQwOTozNzozOXxuZXh0Q3Vyc29yPTc0MDEyMg==",
      { limit: 20, updatedFrom: "2026-09-15T14:36:47Z", updatedTo: "2026-09-16T14:36:47Z" },
    );
    await adapter.discover(undefined, {
      limit: 20,
      updatedFrom: "2026-09-15T14:36:47Z",
      updatedTo: "2026-09-16T14:36:47Z",
    });

    const resumed = new URL(requested[0] ?? "");
    expect(resumed.searchParams.get("cursor")).toContain("nextCursor=740122");
    expect(resumed.searchParams.get("updatedFrom")).toBe("2026-09-15T09:37:39");
    expect(resumed.searchParams.get("updatedTo")).toBe("2026-09-16T09:37:39");

    const encoded = new URL(requested[1] ?? "");
    expect(encoded.searchParams.get("updatedFrom")).toBe("2026-09-15T09:37:39");
    expect(encoded.searchParams.get("updatedTo")).toBe("2026-09-16T09:37:39");
    expect(encoded.searchParams.has("cursor")).toBe(true);

    const fresh = new URL(requested[2] ?? "");
    expect(fresh.searchParams.get("cursor")).toBeNull();
    expect(fresh.searchParams.get("updatedFrom")).toBe("2026-09-15T14:36:47Z");
    expect(fresh.searchParams.get("updatedTo")).toBe("2026-09-16T14:36:47Z");
  });
});
