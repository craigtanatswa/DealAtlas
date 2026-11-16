import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics/utm-value", () => ({
  sanitizeUtmValue: (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value : null,
}));

import { ANALYTICS_ANON_ID_FIELD, ATTRIBUTION_FIELDS } from "@/lib/analytics/attribution";
import {
  MAX_OAUTH_UTM_LENGTH,
  decodeOAuthUtm,
  encodeOAuthUtm,
} from "@/lib/auth/oauth-utm";

const ANON_ID = "019a0c1e-1111-7111-8111-111111111111";

function reader(values: Record<string, string>) {
  return (name: string) => values[name];
}

function longValue(marker: string) {
  return `${marker.repeat(200)} + ${marker}`;
}

describe("OAuth UTM encode cap", () => {
  it("caps the encoded cookie at 400 by dropping UTMs first and keeps anon_id and consent", () => {
    const encoded = encodeOAuthUtm(
      reader({
        [ATTRIBUTION_FIELDS.utm_source]: longValue("s"),
        [ATTRIBUTION_FIELDS.utm_medium]: longValue("m"),
        [ATTRIBUTION_FIELDS.utm_campaign]: longValue("c"),
        [ANALYTICS_ANON_ID_FIELD]: ANON_ID,
        [ATTRIBUTION_FIELDS.consent]: "granted",
      }),
    );

    expect(encoded).not.toBeNull();
    expect(encoded!.length).toBeLessThanOrEqual(MAX_OAUTH_UTM_LENGTH);
    expect(encoded).not.toContain("utm_campaign=");
    expect(encoded).not.toContain("utm_medium=");

    const read = decodeOAuthUtm(encoded);
    expect(read(ANALYTICS_ANON_ID_FIELD)).toBe(ANON_ID);
    expect(read(ATTRIBUTION_FIELDS.consent)).toBe("granted");
    expect(read(ATTRIBUTION_FIELDS.utm_source)).toBe(longValue("s"));
    expect(read(ATTRIBUTION_FIELDS.utm_medium)).toBeUndefined();
    expect(read(ATTRIBUTION_FIELDS.utm_campaign)).toBeUndefined();
  });

  it("leaves an under-cap input byte-identical", () => {
    const encoded = encodeOAuthUtm(
      reader({
        [ATTRIBUTION_FIELDS.utm_source]: "newsletter",
        [ATTRIBUTION_FIELDS.utm_medium]: "email",
        [ATTRIBUTION_FIELDS.utm_campaign]: "oct-launch",
        [ANALYTICS_ANON_ID_FIELD]: ANON_ID,
        [ATTRIBUTION_FIELDS.consent]: "granted",
      }),
    );

    expect(encoded).toBe(
      `utm_source=newsletter&utm_medium=email&utm_campaign=oct-launch&anon_id=${ANON_ID}&consent=granted`,
    );
  });
});
