import { describe, expect, it } from "vitest";

import {
  loadDiscoverySeeds,
  SEARCH_DISCOVERY_SOURCE_KEY,
  seedSourceInsertRows,
  UK_DISCOVERY_SEEDS,
  type SeedClient,
} from "@/ingestion/discovery/seeds";
import { SOURCE_PLATFORM_MARKERS } from "@/lib/redaction/gate-vocabulary";
import type { Database } from "@/lib/db/database.types";

type Insert = Database["public"]["Tables"]["data_sources"]["Insert"];

function fakeSeedClient(existing: Array<{ id: string; source_key: string }>) {
  const rows = [...existing];
  const inserted: Insert[] = [];
  let nextId = 1;
  const client = {
    from() {
      return {
        select() {
          return {
            async in(_column: string, keys: string[]) {
              return {
                data: rows.filter((row) => keys.includes(row.source_key)),
                error: null,
              };
            },
          };
        },
        async insert(batch: Insert[]) {
          inserted.push(...batch);
          for (const row of batch) {
            rows.push({
              id: `new-${nextId++}`,
              source_key: String(row.source_key),
            });
          }
          return { error: null };
        },
      };
    },
  };
  return { client: client as unknown as SeedClient, inserted, rows };
}

describe("private discovery seeds", () => {
  it("loads every buyer seed disabled, UNKNOWN and unscraped", () => {
    const rows = seedSourceInsertRows();
    const buyerRows = rows.filter(
      (row) => row.source_key !== SEARCH_DISCOVERY_SOURCE_KEY,
    );
    expect(buyerRows).toHaveLength(UK_DISCOVERY_SEEDS.length);

    for (const row of buyerRows) {
      expect(row.enabled).toBe(false);
      expect(row.reuse_status).toBe("UNKNOWN");
      expect(row.scraping_permitted).toBe(false);
      expect(row.auto_publish).toBe(false);
      expect(row.discovery_method).toBe("HTML");
    }
    expect(rows.find((row) => row.source_key === SEARCH_DISCOVERY_SOURCE_KEY)).toMatchObject({
      enabled: false,
      scraping_permitted: false,
      auto_publish: false,
    });
  });

  it("includes every seed name and domain in the leak gate vocabulary", () => {
    const markers = new Set<string>(SOURCE_PLATFORM_MARKERS);
    for (const seed of UK_DISCOVERY_SEEDS) {
      expect(markers.has(seed.name.toLowerCase())).toBe(true);
      const host = new URL(seed.baseUrl ?? "").hostname.replace(/^www\./, "");
      expect(markers.has(host)).toBe(true);
    }
  });

  it("inserts only missing seeds and preserves an admin-edited existing row", async () => {
    const existingKey = UK_DISCOVERY_SEEDS[0].sourceKey;
    const { client, inserted } = fakeSeedClient([
      { id: "admin-source-id", source_key: existingKey },
    ]);

    const first = await loadDiscoverySeeds(client);
    expect(first.inserted).toBe(UK_DISCOVERY_SEEDS.length);
    expect(first.existing).toBe(1);
    expect(first.sourcesByKey.get(existingKey)).toBe("admin-source-id");
    expect(inserted.map((row) => row.source_key)).not.toContain(existingKey);
    expect(inserted.every((row) => row.enabled === false)).toBe(true);
    expect(inserted.every((row) => row.scraping_permitted === false)).toBe(true);

    const second = await loadDiscoverySeeds(client);
    expect(second.inserted).toBe(0);
    expect(second.existing).toBe(UK_DISCOVERY_SEEDS.length + 1);
  });
});
