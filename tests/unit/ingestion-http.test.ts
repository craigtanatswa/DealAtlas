import { describe, expect, it } from "vitest";

import { IngestionError } from "@/ingestion/core/errors";
import {
  assertAllowedUrl,
  createAllowlistedJsonClient,
  createAllowlistedTextClient,
} from "@/ingestion/core/http";
import { FIND_A_TENDER_FETCH_POLICY } from "@/ingestion/sources/find-a-tender/constants";
import { NISTA_FETCH_POLICY } from "@/ingestion/sources/uk-infrastructure-pipeline/constants";

describe("Find a Tender fetch allowlist", () => {
  it("allows official OCDS API URLs", () => {
    const url = assertAllowedUrl(
      "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=1",
      FIND_A_TENDER_FETCH_POLICY,
    );
    expect(url.pathname).toBe("/api/1.0/ocdsReleasePackages");
  });

  it("refuses HTML notice pages and foreign hosts", () => {
    expect(() =>
      assertAllowedUrl(
        "https://www.find-tender.service.gov.uk/Notice/000001-2026",
        FIND_A_TENDER_FETCH_POLICY,
      ),
    ).toThrow(IngestionError);

    expect(() =>
      assertAllowedUrl("https://evil.example/api/1.0/ocdsReleasePackages", FIND_A_TENDER_FETCH_POLICY),
    ).toThrow(/host/);

    expect(() =>
      assertAllowedUrl(
        "http://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages",
        FIND_A_TENDER_FETCH_POLICY,
      ),
    ).toThrow(/https:/);
  });

  it("allows the official NISTA dashboard JSON layout and refuses HTML pages", () => {
    const url = assertAllowedUrl(
      "https://pipeline.nista.grid.civilservice.gov.uk/_dash-layout",
      NISTA_FETCH_POLICY,
    );
    expect(url.pathname).toBe("/_dash-layout");

    expect(() =>
      assertAllowedUrl(
        "https://pipeline.nista.grid.civilservice.gov.uk/",
        NISTA_FETCH_POLICY,
      ),
    ).toThrow(/path/);
  });
});

describe("allowlisted fetch SSRF controls", () => {
  it("refuses file, loopback metadata, and credentialed URLs", () => {
    expect(() =>
      assertAllowedUrl("file:///etc/passwd", FIND_A_TENDER_FETCH_POLICY),
    ).toThrow(/https:/);
    expect(() =>
      assertAllowedUrl("https://169.254.169.254/latest/meta-data/", FIND_A_TENDER_FETCH_POLICY),
    ).toThrow(/host/);
    expect(() =>
      assertAllowedUrl(
        "https://user:pass@www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages",
        FIND_A_TENDER_FETCH_POLICY,
      ),
    ).toThrow(/credential/);
  });

  it("re-validates redirect targets against the allowlist", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname === "www.find-tender.service.gov.uk") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/steal" },
        });
      }
      throw new Error(`unexpected fetch ${url.toString()}`);
    }) as typeof fetch;

    const client = createAllowlistedTextClient(FIND_A_TENDER_FETCH_POLICY, { fetchImpl });
    await expect(
      client.getText(
        "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=1",
      ),
    ).rejects.toThrow(/host/);
  });

  it("names the cause code and host when fetch fails", async () => {
    const fetchImpl = (async () => {
      const error = new TypeError("fetch failed");
      Object.assign(error, {
        cause: Object.assign(new Error("connect timeout"), {
          code: "UND_ERR_CONNECT_TIMEOUT",
        }),
      });
      throw error;
    }) as typeof fetch;

    const client = createAllowlistedTextClient(FIND_A_TENDER_FETCH_POLICY, { fetchImpl });
    const url =
      "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?updatedFrom=secret-token";
    await expect(client.getText(url)).rejects.toMatchObject({
      code: "HTTP_NETWORK",
      message: "UND_ERR_CONNECT_TIMEOUT fetching www.find-tender.service.gov.uk",
    });
  });

  it("sends a descriptive user agent and json accept on the open API", async () => {
    let headers: HeadersInit | undefined;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      headers = init?.headers;
      return new Response('{"releases":[]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const client = createAllowlistedJsonClient(FIND_A_TENDER_FETCH_POLICY, { fetchImpl });
    await client.getJson(
      "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=100",
    );
    expect(headers).toEqual({
      Accept: "application/json",
      "User-Agent": "DealAtlas-ingest/1.0 (+https://www.dealatlas.uk)",
    });
  });

  it("names the HTTP status and host without the query string", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 502 })) as typeof fetch;
    const client = createAllowlistedTextClient(FIND_A_TENDER_FETCH_POLICY, { fetchImpl });
    await expect(
      client.getText(
        "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?updatedFrom=secret-token",
      ),
    ).rejects.toMatchObject({
      message: "HTTP 502 from www.find-tender.service.gov.uk",
    });
  });
});
