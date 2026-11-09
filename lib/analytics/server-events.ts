import { createHash } from "node:crypto";

import { ATTRIBUTION_FIELDS } from "@/lib/analytics/attribution";
import { cleanPath } from "@/lib/analytics/clean-path";
import {
  SIGNUP_UTM_KEYS,
  isGuideCtaPosition,
  isGuideCtaTarget,
  isKnownGuideSlug,
  type CheckoutAnalyticsPlan,
  type ServerEventName,
} from "@/lib/analytics/events";
import {
  FIRST_TOUCH_DIRECT,
  OTHER_REFERRER,
  cleanReferrerDomain,
  cleanUtmValue,
  firstTouchReferrerDomain,
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

function firstPresent(read: FieldReader, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = read(key);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function guideCtaPair(read: FieldReader): { position: string; target: string } | null {
  const position = firstPresent(read, [
    ATTRIBUTION_FIELDS.firstTouchGuideCtaPosition,
    "first_touch_guide_cta_position",
  ]);
  const target = firstPresent(read, [
    ATTRIBUTION_FIELDS.firstTouchGuideCtaTarget,
    "first_touch_guide_cta_target",
  ]);
  if (isGuideCtaPosition(position) && isGuideCtaTarget(target)) {
    return { position, target };
  }

  const combined = firstPresent(read, [
    ATTRIBUTION_FIELDS.firstTouchGuideCta,
    "first_touch_guide_cta",
  ]);
  if (typeof combined === "string") {
    const trimmed = combined.trim();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const [combinedPosition, combinedTarget] = trimmed.split(":");
      return isGuideCtaPosition(combinedPosition) && isGuideCtaTarget(combinedTarget)
        ? { position: combinedPosition, target: combinedTarget }
        : null;
    }
    if (isRecord(parsed)) {
      const parsedPosition = parsed.position;
      const parsedTarget = parsed.target;
      return isGuideCtaPosition(parsedPosition) && isGuideCtaTarget(parsedTarget)
        ? { position: parsedPosition, target: parsedTarget }
        : null;
    }
    return null;
  }
  if (isRecord(combined)) {
    const combinedPosition = combined.position;
    const combinedTarget = combined.target;
    return isGuideCtaPosition(combinedPosition) && isGuideCtaTarget(combinedTarget)
      ? { position: combinedPosition, target: combinedTarget }
      : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

  const newLanding = read(ATTRIBUTION_FIELDS.firstTouchLandingPath);
  const oldLanding = read(ATTRIBUTION_FIELDS.firstLandingPath);
  const landingSource = newLanding ?? oldLanding;
  const landing =
    typeof landingSource === "string" && landingSource ? cleanPath(landingSource) : null;
  if (landing) {
    properties.first_touch_landing_path = landing;
    setOnce.first_touch_landing_path = landing;
    if (newLanding === undefined || newLanding === null) {
      properties.first_landing_path = landing;
      setOnce.first_landing_path = landing;
    }
  }

  const newReferrer = read(ATTRIBUTION_FIELDS.firstTouchReferrerDomain);
  const oldReferrer = read(ATTRIBUTION_FIELDS.firstReferrerDomain);
  const referrerSource = newReferrer ?? oldReferrer;
  if (referrerSource !== undefined && referrerSource !== null) {
    const firstTouch = firstTouchReferrerDomain(referrerSource);
    // Re-bucket on the server too: even a tampered raw hostname must never
    // reach PostHog properties or $set_once.
    const domain =
      firstTouch === FIRST_TOUCH_DIRECT
        ? FIRST_TOUCH_DIRECT
        : (cleanReferrerDomain(firstTouch) ?? OTHER_REFERRER);
    properties.first_touch_referrer_domain = domain;
    setOnce.first_touch_referrer_domain = domain;
    if (newReferrer === undefined || newReferrer === null) {
      const bucket = cleanReferrerDomain(oldReferrer);
      if (bucket && bucket !== "$direct") {
        properties.first_referrer_domain = bucket;
        setOnce.first_referrer_domain = bucket;
      }
    }
  }

  for (const key of SIGNUP_UTM_KEYS) {
    const value = cleanUtmValue(read(ATTRIBUTION_FIELDS[key]));
    if (value) {
      properties[key] = value;
      setOnce[key] = value;
    }
  }

  const guideCta = guideCtaPair(read);
  if (guideCta) {
    properties.first_touch_guide_cta = guideCta;
    setOnce.first_touch_guide_cta = guideCta;
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