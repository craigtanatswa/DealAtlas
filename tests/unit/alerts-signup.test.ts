import { describe, expect, it, vi } from "vitest";

import {
  ALERTS_SIGNUP_ENDPOINT,
  alertsCategorySlug,
  submitAlertsSignup,
} from "@/lib/alerts/signup";

const INPUT = {
  email: "buyer@example.com",
  consent: true,
  website: "",
  dealSlug: "council-it-support-a1b2c3",
};

function response(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("submitAlertsSignup", () => {
  it("posts the exact allowlisted body and treats 202 as pending", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(202));
    const result = await submitAlertsSignup(
      INPUT,
      fetchMock,
    );

    expect(result).toEqual({ outcome: "pending" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(ALERTS_SIGNUP_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    const body = JSON.parse(String(init?.body));
    expect(Object.keys(body).sort()).toEqual([
      "consent",
      "dealSlug",
      "email",
      "source",
      "website",
    ]);
    expect(body).toEqual({
      email: INPUT.email,
      dealSlug: INPUT.dealSlug,
      consent: true,
      source: "deal_page",
      website: "",
    });
  });

  it("omits dealSlug when it is undefined", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(202));
    await submitAlertsSignup(
      { email: INPUT.email, consent: true, website: "" },
      fetchMock,
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(Object.keys(body).sort()).toEqual([
      "consent",
      "email",
      "source",
      "website",
    ]);
  });

  it("maps 400 INVALID_EMAIL to invalid", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      response(400, { error: "INVALID_EMAIL" }),
    );
    const result = await submitAlertsSignup(
      INPUT,
      fetchMock,
    );
    expect(result).toEqual({ outcome: "invalid", error: "INVALID_EMAIL" });
  });

  it("maps 400 CONSENT_REQUIRED to invalid", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      response(400, { error: "CONSENT_REQUIRED" }),
    );
    const result = await submitAlertsSignup(
      INPUT,
      fetchMock,
    );
    expect(result).toEqual({
      outcome: "invalid",
      error: "CONSENT_REQUIRED",
    });
  });

  it("defaults unknown 400 errors to INVALID_EMAIL", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(400, { error: "UNKNOWN" }));
    const result = await submitAlertsSignup(
      INPUT,
      fetchMock,
    );
    expect(result).toEqual({ outcome: "invalid", error: "INVALID_EMAIL" });
  });

  it("parses Retry-After seconds for 429", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      response(429, undefined, { "retry-after": "120" }),
    );
    const result = await submitAlertsSignup(
      INPUT,
      fetchMock,
    );
    expect(result).toEqual({
      outcome: "rate_limited",
      retryAfterSeconds: 120,
    });
  });

  it("returns null seconds when Retry-After is missing", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(429));
    const result = await submitAlertsSignup(
      INPUT,
      fetchMock,
    );
    expect(result).toEqual({
      outcome: "rate_limited",
      retryAfterSeconds: null,
    });
  });

  it("returns error for other statuses and thrown requests", async () => {
    const failing = vi.fn<typeof fetch>(async () => response(500));
    await expect(
      submitAlertsSignup(INPUT, failing),
    ).resolves.toEqual({ outcome: "error" });

    const throwing = vi.fn<typeof fetch>(async () => {
      throw new Error("network down");
    });
    await expect(
      submitAlertsSignup(INPUT, throwing),
    ).resolves.toEqual({ outcome: "error" });
  });
});

describe("alertsCategorySlug", () => {
  it("matches catalog slugs and names case-insensitively", () => {
    expect(alertsCategorySlug("technology")).toBe("technology");
    expect(alertsCategorySlug(" Technology ")).toBe("technology");
    expect(alertsCategorySlug("Professional Services")).toBe(
      "professional-services",
    );
    expect(alertsCategorySlug("construction & infrastructure")).toBe(
      "construction-infrastructure",
    );
  });

  it("falls back to other for blank or unknown values", () => {
    expect(alertsCategorySlug(null)).toBe("other");
    expect(alertsCategorySlug(undefined)).toBe("other");
    expect(alertsCategorySlug("")).toBe("other");
    expect(alertsCategorySlug("not-a-category")).toBe("other");
  });
});
