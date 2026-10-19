import { describe, expect, it } from "vitest";

import { recordLanding, attributionFormValues, resetAttributionForTests, ATTRIBUTION_FIELDS } from "@/lib/analytics/attribution";
import {
  REFERRER_BUCKETS,
  cleanReferrer,
  cleanReferrerDomain,
  referrerBucketForHost,
} from "@/lib/analytics/sanitize";
import { buildUserSignedUpEvent } from "@/lib/analytics/server-events";

const ORIGIN = "https://www.dealatlas.uk";

describe("referrer buckets", () => {
  it.each([
    ["www.google.com", "google"],
    ["google.co.uk", "google"],
    ["news.google.com.au", "google"],
    ["www.google.de", "google"],
    ["www.bing.com", "bing"],
    ["duckduckgo.com", "duckduckgo"],
    ["search.yahoo.com", "yahoo"],
    ["uk.search.yahoo.co.uk", "yahoo"],
    ["www.ecosia.org", "ecosia"],
    ["www.linkedin.com", "linkedin"],
    ["lnkd.in", "linkedin"],
    ["x.com", "x"],
    ["twitter.com", "x"],
    ["mobile.twitter.com", "x"],
    ["t.co", "x"],
    ["l.facebook.com", "facebook"],
    ["m.facebook.com", "facebook"],
    ["fb.me", "facebook"],
    ["old.reddit.com", "reddit"],
    ["www.youtube.com", "youtube"],
    ["youtu.be", "youtube"],
    ["WWW.GOOGLE.COM.", "google"],
  ])("%s → %s", (host, bucket) => {
    expect(referrerBucketForHost(host)).toBe(bucket);
  });

  it.each([
    "portal.example-council.gov.uk",
    "www.find-tender.service.gov.uk",
    "google.evil.example",
    "notgoogle.com",
    "googleusercontent.com",
    "xx.com.evil",
    "my-x.com.example",
    "chatgpt.com",
  ])("%s → other", (host) => {
    expect(referrerBucketForHost(host)).toBe("other");
  });

  it("cleanReferrerDomain accepts bucket labels, hosts and URLs, and never returns a host", () => {
    for (const bucket of [...REFERRER_BUCKETS, "$direct", "other"]) {
      expect(cleanReferrerDomain(bucket)).toBe(bucket);
    }
    expect(cleanReferrerDomain("https://www.linkedin.com/feed/?trk=CANARY")).toBe("linkedin");
    expect(cleanReferrerDomain("www.buyer-portal.example")).toBe("other");
    expect(cleanReferrerDomain("javascript:alert(1)")).toBe("other");
    expect(cleanReferrerDomain("")).toBeUndefined();
    expect(cleanReferrerDomain(42)).toBeUndefined();
  });

  it("cleanReferrer keeps internal referrers as cleaned paths and buckets the rest", () => {
    expect(cleanReferrer(`${ORIGIN}/deals/some-deal-slug?q=x`, ORIGIN)).toEqual({
      referrer: "/deals/[deal]",
      domain: "www.dealatlas.uk",
    });
    expect(cleanReferrer("https://t.co/abc123", ORIGIN)).toEqual({ referrer: "x", domain: "x" });
    expect(cleanReferrer("https://buyer.example/notice/1", ORIGIN)).toEqual({
      referrer: "other",
      domain: "other",
    });
    expect(cleanReferrer("", ORIGIN)).toEqual({ referrer: "$direct", domain: "$direct" });
  });

  it("first_referrer_domain is bucketed from first touch through to the server event", () => {
    resetAttributionForTests();
    recordLanding({
      href: `${ORIGIN}/pricing`,
      referrer: "https://portal.example-council.gov.uk/notice/12345",
      origin: ORIGIN,
    });
    const values = attributionFormValues();
    expect(values[ATTRIBUTION_FIELDS.firstReferrerDomain]).toBe("other");

    const tampered = buildUserSignedUpEvent({
      userId: "6b0a3d5e-1c2f-4a8b-9d7e-0f1a2b3c4d5e",
      read: (name) =>
        name === ATTRIBUTION_FIELDS.firstReferrerDomain ? "portal.example-council.gov.uk" : undefined,
    });
    expect(JSON.stringify(tampered)).not.toMatch(/example|council/);
    expect(tampered?.properties.first_referrer_domain).toBe("other");
    resetAttributionForTests();
  });
});
