import fs from "node:fs";
import path from "node:path";

import type { JsonGetResult, JsonHttpClient } from "@/ingestion/core/http";
import { FIND_A_TENDER_RELEASE_API } from "@/ingestion/sources/find-a-tender/constants";

export function readFindATenderFixture(name: string): unknown {
  const filePath = path.join(
    process.cwd(),
    "tests/fixtures/ingestion/find-a-tender",
    name,
  );
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

export function packageFromFixtures(names: string[]): unknown {
  const releases = names.flatMap((name) => {
    const payload = readFindATenderFixture(name) as {
      releases?: unknown[];
    };
    return payload.releases ?? [];
  });
  return {
    uri: FIND_A_TENDER_RELEASE_API,
    version: "1.1",
    license:
      "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    releases,
  };
}

export function createFixtureHttpClient(
  packagesByUrl: Map<string, unknown> | ((url: string) => unknown),
): JsonHttpClient {
  return {
    async getJson(url: string): Promise<JsonGetResult> {
      const body =
        typeof packagesByUrl === "function"
          ? packagesByUrl(url)
          : (packagesByUrl.get(url) ??
            [...packagesByUrl.values()][0]);
      return {
        url,
        status: 200,
        contentType: "application/json",
        body,
        rawText: JSON.stringify(body),
      };
    },
  };
}
