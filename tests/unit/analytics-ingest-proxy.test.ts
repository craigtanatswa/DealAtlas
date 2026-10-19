import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { decodeIngestBody, sanitizeIngestEvents } from "@/lib/analytics/ingest-proxy";

const ORIGIN = "https://www.dealatlas.uk";
const TOKEN = "phc_TestKey0123456789abcdef";

function rawEvent(url: string) {
  return {
    uuid: "019a0c1e-0000-7000-8000-000000000001",
    event: "$pageview",
    properties: {
      token: TOKEN,
      distinct_id: "019a0c1e-9a4d-7c8e-8b1f-2d6e5a7c9b10",
      $current_url: url,
      $title: "CANARY SOURCE TITLE NEVER FREE",
    },
  };
}

describe("/ingest proxy re-sanitising", () => {
  const batch = [rawEvent(`${ORIGIN}/deals/canary-a1b2c3?q=CANARY`), rawEvent("https://evil.example/x")];

  it("decodes JSON, gzip and base64 form bodies", () => {
    const json = JSON.stringify(batch);
    expect(decodeIngestBody(new TextEncoder().encode(json), "application/json", null)).toEqual(batch);
    expect(decodeIngestBody(new Uint8Array(gzipSync(json)), "text/plain", null)).toEqual(batch);
    const form = `data=${encodeURIComponent(Buffer.from(json).toString("base64"))}`;
    expect(
      decodeIngestBody(new TextEncoder().encode(form), "application/x-www-form-urlencoded", "base64"),
    ).toEqual(batch);
  });

  it("forwards only sanitised events from our own origins", () => {
    const events = sanitizeIngestEvents(batch, new Set([ORIGIN]));
    expect(events).toHaveLength(1);
    expect(events[0]!.properties.$current_url).toBe(`${ORIGIN}/deals/[deal]`);
    expect(JSON.stringify(events)).not.toMatch(/CANARY|canary-a1b2c3|evil/);
  });

  it("accepts a { batch } envelope and caps the batch size", () => {
    const many = Array.from({ length: 150 }, () => rawEvent(`${ORIGIN}/pricing`));
    expect(sanitizeIngestEvents({ batch: many }, new Set([ORIGIN]))).toHaveLength(100);
  });
});
