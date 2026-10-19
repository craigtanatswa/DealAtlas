import { describe, expect, it } from "vitest";

import { createAllowlistedTextClient, type TextHttpClient } from "@/ingestion/core/http";
import { IngestionError } from "@/ingestion/core/errors";
import { assertRobotsAllow } from "@/ingestion/core/robots";

const ROBOTS = "https://grants.example.gov.uk/robots.txt";

function client(result: { url?: string; status?: number; body: string }): TextHttpClient {
  return {
    async getText(url: string) {
      return {
        url: result.url ?? url,
        status: result.status ?? 200,
        contentType: "text/plain",
        body: result.body,
      };
    },
  };
}

function throwing(code: string): TextHttpClient {
  return {
    async getText() {
      throw new IngestionError({ message: code, stage: "fetch", code, retryable: false });
    },
  };
}

function check(http: TextHttpClient) {
  return assertRobotsAllow({ http, robotsUrl: ROBOTS, path: "/grants", sourceLabel: "Test" });
}

describe("robots.txt redirects and login pages", () => {
  it("treats a redirect to a login page as disallow-all", async () => {
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response(null, { status: 302, headers: { location: "/login?next=/robots.txt" } });
      }
      return new Response("<html><form><input type=password></form></html>", { status: 200 });
    }) as typeof fetch;
    const http = createAllowlistedTextClient(
      { protocol: "https:", hosts: ["grants.example.gov.uk"], pathPrefixes: ["/robots.txt", "/grants"] },
      { fetchImpl },
    );
    await expect(check(http)).rejects.toMatchObject({ code: "ROBOTS_DISALLOW" });
  });

  it("treats a redirect off host or an unfollowable redirect as disallow-all", async () => {
    await expect(check(throwing("URL_HOST_DENIED"))).rejects.toMatchObject({ code: "ROBOTS_DISALLOW" });
    await expect(check(throwing("URL_PATH_DENIED"))).rejects.toMatchObject({ code: "ROBOTS_DISALLOW" });
    await expect(check(throwing("HTTP_REDIRECT"))).rejects.toMatchObject({ code: "ROBOTS_DISALLOW" });
  });

  it("treats a followed redirect that lands off the robots path as disallow-all", async () => {
    await expect(
      check(client({ url: "https://grants.example.gov.uk/sign-in", body: "User-agent: *\nDisallow:" })),
    ).rejects.toMatchObject({ code: "ROBOTS_DISALLOW" });
  });

  it("treats a login page served at the robots path as disallow-all", async () => {
    await expect(
      check(client({ body: "<!doctype html><html><h1>Sign in</h1><input type=\"password\"></html>" })),
    ).rejects.toMatchObject({ code: "ROBOTS_DISALLOW" });
  });

  it("still treats a real 404 as no rules", async () => {
    await expect(check(client({ status: 404, body: "not found" }))).resolves.toBeUndefined();
    await expect(check(throwing("HTTP_404"))).resolves.toBeUndefined();
  });

  it("still honours a published robots.txt", async () => {
    await expect(check(client({ body: "User-agent: *\nDisallow:" }))).resolves.toBeUndefined();
    await expect(
      check(client({ body: "User-agent: *\nDisallow: /grants" })),
    ).rejects.toMatchObject({ code: "ROBOTS_DISALLOW" });
  });
});
