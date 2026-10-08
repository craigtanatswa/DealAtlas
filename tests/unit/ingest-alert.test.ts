import { describe, expect, it } from "vitest";

import { ingestAlertBody, ingestAlertShouldSkip, sendIngestAlert } from "@/lib/jobs/ingest-alert";

describe("open ingest alerts", () => {
  it("skips a missing or placeholder recipient", () => {
    expect(ingestAlertShouldSkip(undefined)).toBe(true);
    expect(ingestAlertShouldSkip("")).toBe(true);
    expect(ingestAlertShouldSkip("not-an-email")).toBe(true);
    expect(ingestAlertShouldSkip("ops@example.com")).toBe(true);
    expect(ingestAlertShouldSkip("placeholder@dealatlas.co.uk")).toBe(true);
    expect(ingestAlertShouldSkip("ops@dealatlas.co.uk")).toBe(false);
  });

  it("sends counts only when the recipient is real", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const outcome = await sendIngestAlert({
      to: "ops@dealatlas.co.uk",
      from: "alerts@dealatlas.co.uk",
      apiKey: "re_test",
      countsJson: JSON.stringify({
        fetched: 3,
        new: 1,
        updated: 0,
        unchanged: 2,
        failed: 0,
        title: "Managed IT support",
        url: "https://www.find-tender.service.gov.uk/Notice/1",
      }),
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), body: String(init?.body ?? "") });
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });

    expect(outcome).toBe("sent");
    expect(calls).toHaveLength(1);
    const payload = JSON.parse(calls[0]?.body ?? "{}") as { text?: string };
    expect(JSON.parse(payload.text ?? "{}")).toEqual({
      fetched: 3,
      new: 1,
      updated: 0,
      unchanged: 2,
      failed: 0,
    });
    expect(payload.text).not.toMatch(/managed it|find-tender|http/i);
  });

  it("does not call the provider for a placeholder", async () => {
    let calls = 0;
    const outcome = await sendIngestAlert({
      to: "ops@example.com",
      from: "alerts@dealatlas.co.uk",
      apiKey: "re_test",
      countsJson: ingestAlertBody(undefined),
      fetchImpl: (async () => {
        calls += 1;
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });
    expect(outcome).toBe("skipped");
    expect(calls).toBe(0);
  });
});
