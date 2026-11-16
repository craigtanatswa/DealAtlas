import { describe, expect, it } from "vitest";

import { ANALYTICS_ANON_ID_FIELD, ATTRIBUTION_FIELDS } from "@/lib/analytics/attribution";
import { sanitizeUtmValue } from "@/lib/analytics/utm-value";
import { decodeOAuthUtm, encodeOAuthUtm } from "@/lib/auth/oauth-utm";

const ANON_ID = "019a0c1e-1111-7111-8111-111111111111";

const UTM_FIELDS = [
  ATTRIBUTION_FIELDS.utm_source,
  ATTRIBUTION_FIELDS.utm_medium,
  ATTRIBUTION_FIELDS.utm_campaign,
] as const;

function reader(values: Partial<Record<string, string>>) {
  return (name: string) => values[name];
}

describe("sanitizeUtmValue", () => {
  it("trims and lowercases a valid value", () => {
    expect(sanitizeUtmValue("  Newsletter ")).toBe("newsletter");
  });

  it("accepts 64 characters and rejects 65", () => {
    expect(sanitizeUtmValue("a".repeat(64))).toBe("a".repeat(64));
    expect(sanitizeUtmValue("a".repeat(65))).toBe("other");
  });

  it.each([
    "council tenders",
    "oct.launch",
    "café",
    "<script>",
    "utm=value&next=//evil.example",
  ])("turns %s into other", (value) => {
    expect(sanitizeUtmValue(value)).toBe("other");
  });

  it("returns null for blank and non-string values", () => {
    expect(sanitizeUtmValue("")).toBeNull();
    expect(sanitizeUtmValue("   ")).toBeNull();
    expect(sanitizeUtmValue(null)).toBeNull();
    expect(sanitizeUtmValue(undefined)).toBeNull();
    expect(sanitizeUtmValue(42)).toBeNull();
  });
});

describe("OAuth UTM cookie encoding", () => {
  it("round-trips the three signup UTMs only", () => {
    const encoded = encodeOAuthUtm(
      reader({
        [ATTRIBUTION_FIELDS.utm_source]: " Newsletter ",
        [ATTRIBUTION_FIELDS.utm_medium]: "EMAIL",
        [ATTRIBUTION_FIELDS.utm_campaign]: "Oct-Launch",
        [ATTRIBUTION_FIELDS.utm_term]: "not-carried",
      }),
    );
    expect(encoded).toBe("utm_source=newsletter&utm_medium=email&utm_campaign=oct-launch");

    const read = decodeOAuthUtm(encoded);
    expect(read(ATTRIBUTION_FIELDS.utm_source)).toBe("newsletter");
    expect(read(ATTRIBUTION_FIELDS.utm_medium)).toBe("email");
    expect(read(ATTRIBUTION_FIELDS.utm_campaign)).toBe("oct-launch");
    expect(read(ATTRIBUTION_FIELDS.utm_term)).toBeUndefined();
  });

  it("encodes nothing when all values are blank or absent", () => {
    expect(encodeOAuthUtm(reader({}))).toBeNull();
    expect(
      encodeOAuthUtm(
        reader({
          [ATTRIBUTION_FIELDS.utm_source]: "   ",
          [ATTRIBUTION_FIELDS.utm_medium]: "",
        }),
      ),
    ).toBeNull();
  });

  it("lowercases and buckets invalid values during encoding", () => {
    const encoded = encodeOAuthUtm(
      reader({
        [ATTRIBUTION_FIELDS.utm_source]: "Bad Value",
        [ATTRIBUTION_FIELDS.utm_medium]: "PAID_SOCIAL",
      }),
    );
    expect(encoded).toBe("utm_source=other&utm_medium=paid_social");
  });

  it("rejects cookies longer than 400 characters", () => {
    const read = decodeOAuthUtm(`utm_source=${"a".repeat(400)}`);
    for (const name of UTM_FIELDS) {
      expect(read(name)).toBeUndefined();
    }
  });

  it("ignores extra keys such as next, redirect and utm_term", () => {
    const params = new URLSearchParams({
      utm_source: "newsletter",
      next: "//evil.example",
      redirect: "https://evil.example",
      utm_term: "leak",
    });
    const read = decodeOAuthUtm(params.toString());
    expect(read(ATTRIBUTION_FIELDS.utm_source)).toBe("newsletter");
    expect(read(ATTRIBUTION_FIELDS.utm_term)).toBeUndefined();
    expect(read("next")).toBeUndefined();
    expect(read("redirect")).toBeUndefined();
  });

  it("re-sanitises tampered values", () => {
    const params = new URLSearchParams({
      utm_source: "<script>alert(1)</script>",
      utm_medium: "Paid Social",
      utm_campaign: "OCT_LAUNCH",
    });
    const read = decodeOAuthUtm(params.toString());
    expect(read(ATTRIBUTION_FIELDS.utm_source)).toBe("other");
    expect(read(ATTRIBUTION_FIELDS.utm_medium)).toBe("other");
    expect(read(ATTRIBUTION_FIELDS.utm_campaign)).toBe("oct_launch");
  });

  it("returns all undefined for garbage and missing values", () => {
    for (const value of [undefined, null, "", "%%%&&==", "not a query"]) {
      const read = decodeOAuthUtm(value);
      for (const name of UTM_FIELDS) {
        expect(read(name)).toBeUndefined();
      }
    }
  });

  it("carries an allowlisted anonymous id and explicit form consent", () => {
    const encoded = encodeOAuthUtm(
      reader({
        [ANALYTICS_ANON_ID_FIELD]: ANON_ID,
        [ATTRIBUTION_FIELDS.consent]: "granted",
        [ATTRIBUTION_FIELDS.utm_source]: "newsletter",
      }),
    );
    expect(encoded).toBe(`utm_source=newsletter&anon_id=${ANON_ID}&consent=granted`);

    const read = decodeOAuthUtm(encoded);
    expect(read(ANALYTICS_ANON_ID_FIELD)).toBe(ANON_ID);
    expect(read(ATTRIBUTION_FIELDS.consent)).toBe("granted");
  });

  it("drops an invalid anonymous id and never invents consent", () => {
    const encoded = encodeOAuthUtm(
      reader({
        [ANALYTICS_ANON_ID_FIELD]: "buyer@canary.example",
        [ATTRIBUTION_FIELDS.consent]: "unknown",
      }),
    );
    expect(encoded).toBeNull();
  });

  it("validates a tampered anonymous id and consent on decode", () => {
    const read = decodeOAuthUtm(
      new URLSearchParams({
        anon_id: "buyer@canary.example",
        consent: "yes",
      }).toString(),
    );
    expect(read(ANALYTICS_ANON_ID_FIELD)).toBeUndefined();
    expect(read(ATTRIBUTION_FIELDS.consent)).toBeUndefined();
  });
});
