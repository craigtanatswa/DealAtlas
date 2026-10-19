import { createHash } from "node:crypto";

import { ATTRIBUTION_FIELDS } from "@/lib/analytics/attribution";
import { cleanPath } from "@/lib/analytics/clean-path";
import {
  SIGNUP_UTM_KEYS,
  isKnownGuideSlug,
  type CheckoutAnalyticsPlan,
  type ServerEventName,
} from "@/lib/analytics/events";
import {
  cleanReferrerDomain,
  cleanUtmValue,
  isAnalyticsUuid,
  type SanitizedProperties,
} from "@/lib/analytics/sanitize";
import { DISPLAY_PRICING } from "@/lib/constants";

/**
 * Server events (Security condition 5) are built only from these allowlisted
 * fields. Never pass a Dodo payload, email, name, address, or any payment,
 * customer, subscription or invoice ID into this module.
 */

export type ServerEvent = {
  event: ServerEventName;
  distinctId: string;
  uuid: string;
  properties: SanitizedProperties;
  setOnce?: SanitizedProperties;
};

/** Deterministic event UUID, so a retried capture is the same event. */
export function deterministicEventUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

function poundsFromDisplay(value: string): number {
  const match = /^£(\d+(?:\.\d{1,2})?)\/(?:month|year)$/.exec(value);
  if (!match?.[1]) {
    throw new Error(`Unexpected display price format: ${value}`);
  }
  return Number(match[1]);
}

/** amount_gbp comes from our plan config (DISPLAY_PRICING), never from Dodo. */
export function planAmountGbp(plan: CheckoutAnalyticsPlan): number {
  switch (plan) {
    case "monthly":
      return poundsFromDisplay(DISPLAY_PRICING.proMonthly);
    case "annual":
      return poundsFromDisplay(DISPLAY_PRICING.proAnnual);
    case "founding":
      return poundsFromDisplay(DISPLAY_PRICING.foundingAnnual);
  }
}

type FieldReader = (name: string) => unknown;

export function buildUserSignedUpEvent(input: {
  userId: string;
  read?: FieldReader;
}): ServerEvent | null {
  if (!isAnalyticsUuid(input.userId)) {
    return null;
  }
  const read: FieldReader = input.read ?? (() => undefined);
  const properties: SanitizedProperties = {};
  const setOnce: SanitizedProperties = {};

  const rawLanding = read(ATTRIBUTION_FIELDS.firstLandingPath);
  const landing = typeof rawLanding === "string" && rawLanding ? cleanPath(rawLanding) : null;
  if (landing) {
    properties.first_landing_path = landing;
    setOnce.first_landing_path = landing;
  }
  const referrer = cleanReferrerDomain(read(ATTRIBUTION_FIELDS.firstReferrerDomain));
  if (referrer && referrer !== "$direct") {
    properties.first_referrer_domain = referrer;
    setOnce.first_referrer_domain = referrer;
  }
  for (const key of SIGNUP_UTM_KEYS) {
    const value = cleanUtmValue(read(ATTRIBUTION_FIELDS[key]));
    if (value) {
      properties[key] = value;
    }
  }
  const guide = read(ATTRIBUTION_FIELDS.signupSourceGuide);
  if (isKnownGuideSlug(guide)) {
    properties.signup_source_guide = guide;
  }

  return {
    event: "user_signed_up",
    distinctId: input.userId,
    uuid: deterministicEventUuid(`user_signed_up:${input.userId}`),
    properties,
    ...(Object.keys(setOnce).length > 0 ? { setOnce } : {}),
  };
}

export function buildProSubscribedEvent(input: {
  userId: string;
  providerEventId: string;
  plan: CheckoutAnalyticsPlan;
}): ServerEvent | null {
  if (!isAnalyticsUuid(input.userId) || !input.providerEventId) {
    return null;
  }
  return {
    event: "pro_subscribed",
    distinctId: input.userId,
    // The provider event ID only seeds the UUID; it is never sent.
    uuid: deterministicEventUuid(`pro_subscribed:${input.providerEventId}`),
    properties: { plan: input.plan, amount_gbp: planAmountGbp(input.plan) },
  };
}

/** The exact JSON body sent to PostHog's capture endpoint. */
export function serverCaptureBody(apiKey: string, event: ServerEvent, now: Date) {
  return {
    api_key: apiKey,
    event: event.event,
    distinct_id: event.distinctId,
    uuid: event.uuid,
    timestamp: now.toISOString(),
    properties: {
      ...event.properties,
      $lib: "dealatlas-server",
      // The server's IP says nothing about the user; skip GeoIP enrichment.
      $geoip_disable: true,
      ...(event.setOnce ? { $set_once: event.setOnce } : {}),
    },
  };
}
