import { describe, expect, it } from "vitest";

import {
  candidatesLookLikeDuplicates,
  dedupeKeyForCandidate,
  normalizeCandidateUrl,
} from "@/ingestion/discovery/dedupe";

describe("discovery deduplication", () => {
  it("normalises tracking parameters, www, fragments and trailing slashes", () => {
    expect(
      normalizeCandidateUrl(
        "https://www.Example.com/tenders/rfq-123/?utm_source=newsletter&b=2&a=1#apply",
      ),
    ).toBe("https://example.com/tenders/rfq-123?a=1&b=2");
  });

  it("rejects non-HTTP URLs and resolves relative links", () => {
    expect(normalizeCandidateUrl("mailto:tenders@example.com")).toBeNull();
    expect(normalizeCandidateUrl("/tender/42", "https://example.com/list")).toBe(
      "https://example.com/tender/42",
    );
  });

  it("keys duplicates on buyer, title and deadline rather than URL", () => {
    const left = dedupeKeyForCandidate({
      buyerName: "Example Borough Council",
      title: "Grounds maintenance services",
      deadline: "2026-06-30T12:00:00.000Z",
      normalizedUrl: "https://example.com/tender/a",
    });
    const right = dedupeKeyForCandidate({
      buyerName: "Example Borough Council",
      title: "Grounds Maintenance Services",
      deadline: "2026-06-30T17:00:00.000+01:00",
      normalizedUrl: "https://example.org/notice/b",
    });
    expect(left).toBe(right);
    expect(
      candidatesLookLikeDuplicates(
        {
          buyerName: "Example Borough Council",
          title: "Grounds maintenance services",
          deadline: "2026-06-30T12:00:00.000Z",
        },
        {
          buyerName: "Example Borough Council",
          title: "Grounds maintenance services",
          deadline: "2026-07-01T12:00:00.000Z",
        },
      ),
    ).toBe(false);
  });

  it("falls back to title and deadline when the buyer is unknown", () => {
    const one = dedupeKeyForCandidate({
      buyerName: null,
      title: "Cleaning services",
      deadline: null,
      normalizedUrl: "https://example.com/one",
    });
    const two = dedupeKeyForCandidate({
      buyerName: null,
      title: "Cleaning services",
      deadline: null,
      normalizedUrl: "https://example.net/two",
    });
    expect(one).toBe(two);
  });
});
