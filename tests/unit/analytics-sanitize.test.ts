import { describe, expect, it } from "vitest";

import { sanitizeClientEvent } from "@/lib/analytics/sanitize";

const ORIGIN = "https://www.dealatlas.uk";
const TOKEN = "phc_TestKey0123456789abcdef";
const DISTINCT = "019a0c1e-9a4d-7c8e-8b1f-2d6e5a7c9b10";
const SLUG = "council-it-support-canary-a1b2c3";
const DEAL_ID = "3f2b7c1e-9a4d-4c8e-8b1f-2d6e5a7c9b10";

function sdkEvent(overrides: Record<string, unknown> = {}, event = "$pageview") {
  return {
    uuid: "019a0c1e-0000-7000-8000-000000000001",
    event,
    timestamp: new Date("2026-10-19T12:00:00Z"),
    $set: { email: "buyer@canary.example" },
    $set_once: { $initial_current_url: `${ORIGIN}/deals/${SLUG}` },
    properties: {
      token: TOKEN,
      distinct_id: DISTINCT,
      $process_person_profile: false,
      $lib: "web",
      $lib_version: "1.438.12",
      $browser: "Chrome",
      $browser_version: 141,
      $os: "Mac OS X",
      $device_type: "Desktop",
      $screen_height: 900,
      $screen_width: 1440,
      $viewport_height: 800,
      $viewport_width: 1400,
      $session_id: "019a0c1e-1111-7000-8000-000000000001",
      $window_id: "019a0c1e-2222-7000-8000-000000000001",
      $insert_id: "abc123",
      $time: 1760875200,
      $current_url: `${ORIGIN}/deals/${SLUG}?q=CANARY%20BUYER&utm_source=newsletter&utm_campaign=oct-launch#contact`,
      $host: "www.dealatlas.uk",
      $pathname: `/deals/${SLUG}`,
      $title: "CANARY SOURCE TITLE NEVER FREE · DealAtlas",
      $referrer: `${ORIGIN}/app/deals/${DEAL_ID}?tab=buyer`,
      $referring_domain: "www.dealatlas.uk",
      $initial_current_url: `${ORIGIN}/deals/${SLUG}`,
      $initial_pathname: `/deals/${SLUG}`,
      $session_entry_url: `${ORIGIN}/deals/${SLUG}`,
      $session_entry_pathname: `/deals/${SLUG}`,
      $entry_url: `${ORIGIN}/deals/${SLUG}`,
      $prev_pageview_pathname: `/deals/${SLUG}`,
      $raw_user_agent: "Mozilla/5.0",
      $config_defaults: "unset",
      $set: { email: "buyer@canary.example" },
      $set_once: { first: "x" },
      $some_future_sdk_property: `${ORIGIN}/deals/${SLUG}`,
      buyer_name: "CANARY BUYER NEVER FREE",
      deal_id: DEAL_ID,
      ...overrides,
    },
  };
}

describe("fail-closed before_send allowlist", () => {
  it("keeps only allowlisted properties and cleans every URL", () => {
    const result = sanitizeClientEvent(sdkEvent(), { origin: ORIGIN });
    expect(result).not.toBeNull();
    expect(Object.keys(result!).sort()).toEqual(["event", "properties", "timestamp", "uuid"]);
    expect(result!.properties).toEqual({
      token: TOKEN,
      distinct_id: DISTINCT,
      $process_person_profile: false,
      $lib: "web",
      $lib_version: "1.438.12",
      $browser: "Chrome",
      $browser_version: 141,
      $os: "Mac OS X",
      $device_type: "Desktop",
      $screen_height: 900,
      $screen_width: 1440,
      $viewport_height: 800,
      $viewport_width: 1400,
      $session_id: "019a0c1e-1111-7000-8000-000000000001",
      $window_id: "019a0c1e-2222-7000-8000-000000000001",
      $insert_id: "abc123",
      $time: 1760875200,
      $pathname: "/deals/[deal]",
      $current_url: `${ORIGIN}/deals/[deal]?utm_source=newsletter&utm_campaign=oct-launch`,
      $referrer: "/app/deals/[deal]",
      $referring_domain: "www.dealatlas.uk",
      utm_source: "newsletter",
      utm_campaign: "oct-launch",
    });
    const serialised = JSON.stringify(result);
    for (const forbidden of [SLUG, DEAL_ID, "CANARY", "q=", "#contact", "$title", "$initial", "$session_entry", "$prev_pageview", "$host", "$set", "email", "future_sdk"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("drops external referrers to the hostname", () => {
    const result = sanitizeClientEvent(
      sdkEvent({ $referrer: "https://www.google.com/search?q=CANARY+BUYER" }),
      { origin: ORIGIN },
    );
    expect(result!.properties.$referrer).toBe("www.google.com");
    expect(result!.properties.$referring_domain).toBe("www.google.com");
  });

  it("strips checkout success identifiers", () => {
    const result = sanitizeClientEvent(
      sdkEvent({
        $current_url: `${ORIGIN}/checkout/success?subscription_id=sub_1&payment_id=pay_1&email=a%40b.com`,
      }),
      { origin: ORIGIN },
    );
    expect(result!.properties.$current_url).toBe(`${ORIGIN}/checkout/success`);
    expect(JSON.stringify(result)).not.toMatch(/sub_1|pay_1|a%40b|a@b/);
  });

  it("sends workspace page views with the cleaned path only", () => {
    const result = sanitizeClientEvent(
      sdkEvent({ $current_url: `${ORIGIN}/app/deals/${DEAL_ID}?utm_source=x` }),
      { origin: ORIGIN },
    );
    expect(result!.properties.$current_url).toBe(`${ORIGIN}/app/deals/[deal]`);
    expect(result!.properties.$referrer).toBeUndefined();
    expect(result!.properties.utm_source).toBeUndefined();
  });

  it("drops admin pages, unknown events, other origins and missing transport fields", () => {
    expect(sanitizeClientEvent(sdkEvent({ $current_url: `${ORIGIN}/admin` }), { origin: ORIGIN })).toBeNull();
    expect(sanitizeClientEvent(sdkEvent({}, "$autocapture"), { origin: ORIGIN })).toBeNull();
    expect(sanitizeClientEvent(sdkEvent({}, "$pageleave"), { origin: ORIGIN })).toBeNull();
    expect(sanitizeClientEvent(sdkEvent({}, "$exception"), { origin: ORIGIN })).toBeNull();
    expect(sanitizeClientEvent(sdkEvent({}, "$web_vitals"), { origin: ORIGIN })).toBeNull();
    expect(sanitizeClientEvent(sdkEvent({}, "$identify"), { origin: ORIGIN })).toBeNull();
    expect(sanitizeClientEvent(sdkEvent({ $current_url: "https://evil.example/deals" }), { origin: ORIGIN })).toBeNull();
    expect(sanitizeClientEvent(sdkEvent({ token: undefined }), { origin: ORIGIN })).toBeNull();
    expect(sanitizeClientEvent(sdkEvent({ distinct_id: "buyer@canary.example" }), { origin: ORIGIN })).toBeNull();
    expect(sanitizeClientEvent(sdkEvent({ $current_url: undefined }), { origin: ORIGIN })).toBeNull();
    expect(sanitizeClientEvent(null, { origin: ORIGIN })).toBeNull();
  });

  it("drops oversized or non-primitive SDK values", () => {
    const result = sanitizeClientEvent(
      sdkEvent({ $browser: "x".repeat(500), $os: { nested: SLUG } }),
      { origin: ORIGIN },
    );
    expect(result!.properties.$browser).toBeUndefined();
    expect(result!.properties.$os).toBeUndefined();
  });

  it("drops UTM values that are not simple tags", () => {
    const result = sanitizeClientEvent(
      sdkEvent({
        $current_url: `${ORIGIN}/pricing?utm_source=${encodeURIComponent("https://x.example/deals/abc")}&utm_medium=email`,
      }),
      { origin: ORIGIN },
    );
    expect(result!.properties.utm_source).toBeUndefined();
    expect(result!.properties.utm_medium).toBe("email");
  });

  it("validates pro_checkout_started", () => {
    const ok = sanitizeClientEvent(
      sdkEvent(
        { plan: "founding", source_path: `/deals/${SLUG}`, $current_url: `${ORIGIN}/deals/${SLUG}` },
        "pro_checkout_started",
      ),
      { origin: ORIGIN },
    );
    expect(ok!.properties.plan).toBe("founding");
    expect(ok!.properties.source_path).toBe("/deals/[deal]");
    expect(
      sanitizeClientEvent(sdkEvent({ plan: "enterprise" }, "pro_checkout_started"), { origin: ORIGIN }),
    ).toBeNull();
  });

  it("validates guide_cta_clicked against the page and the known guides", () => {
    const page = `${ORIGIN}/guides/how-to-win-council-contracts`;
    const ok = sanitizeClientEvent(
      sdkEvent(
        { $current_url: page, guide_slug: "how-to-win-council-contracts", cta_position: "mid", cta_target: "deals" },
        "guide_cta_clicked",
      ),
      { origin: ORIGIN },
    );
    expect(ok!.properties).toMatchObject({
      guide_slug: "how-to-win-council-contracts",
      cta_position: "mid",
      cta_target: "deals",
    });
    expect(
      sanitizeClientEvent(
        sdkEvent(
          { $current_url: `${ORIGIN}/deals/${SLUG}`, guide_slug: SLUG, cta_position: "mid", cta_target: "deals" },
          "guide_cta_clicked",
        ),
        { origin: ORIGIN },
      ),
    ).toBeNull();
  });

  it("is idempotent (the proxy re-runs it on already-clean events)", () => {
    const once = sanitizeClientEvent(sdkEvent(), { origin: ORIGIN });
    const twice = sanitizeClientEvent(once, { origin: ORIGIN });
    expect(twice).toEqual(once);
  });
});
