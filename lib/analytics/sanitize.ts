import {
  cleanPath,
  isAdminPath,
  isWorkspacePath,
} from "@/lib/analytics/clean-path";
import {
  CLIENT_EVENTS,
  GUIDE_CTA_POSITIONS,
  GUIDE_CTA_TARGETS,
  UTM_KEYS,
  isCheckoutAnalyticsPlan,
  isKnownGuideSlug,
  type ClientEventName,
  type UtmKey,
} from "@/lib/analytics/events";

/**
 * Fail-closed property allowlist for every browser event (Security condition 1).
 * Runs as the PostHog before_send hook and again in the /ingest proxy. It
 * builds a brand-new event from allowlisted fields; nothing else is copied, so
 * $title, $initial_*, $session_entry_*, $prev_pageview_*, $host, $set,
 * $set_once and any property a future SDK adds are dropped by construction.
 */

export type SanitizedProperties = Record<string, string | number | boolean>;

export type SanitizedClientEvent = {
  uuid?: string;
  event: ClientEventName;
  properties: SanitizedProperties;
  timestamp?: string | Date;
};

/** SDK basics allowed through unchanged (primitive values only). */
const SDK_BASIC_KEYS = [
  "$lib",
  "$lib_version",
  "$browser",
  "$browser_version",
  "$os",
  "$device_type",
  "$screen_height",
  "$screen_width",
  "$viewport_height",
  "$viewport_width",
  "$session_id",
  "$window_id",
  "$time",
  "$insert_id",
] as const;

const MAX_STRING = 200;
const TOKEN_PATTERN = /^phc_[A-Za-z0-9]{8,100}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UTM_VALUE_PATTERN = /^[A-Za-z0-9._+\- ]{1,100}$/;
const HOSTNAME_PATTERN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const DIRECT = "$direct";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function primitive(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string") {
    return value.length <= MAX_STRING ? value : undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}

export function isPostHogProjectKey(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function isAnalyticsUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function cleanUtmValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return UTM_VALUE_PATTERN.test(trimmed) ? trimmed : undefined;
}

/** Only a bare, valid hostname survives ("www.google.com"). */
export function cleanReferrerDomain(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === DIRECT) {
    return DIRECT;
  }
  let host = trimmed;
  if (trimmed.includes("/") || trimmed.includes(":")) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return undefined;
      }
      host = url.hostname;
    } catch {
      return undefined;
    }
  }
  return HOSTNAME_PATTERN.test(host) ? host : undefined;
}

type ParsedPage = { cleaned: string; utm: Partial<Record<UtmKey, string>> };

/** Parses a same-origin page URL. Any other origin fails closed (null). */
export function parsePageUrl(value: unknown, origin: string): ParsedPage | null {
  if (typeof value !== "string" || value.length > 4096) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) {
    return null;
  }
  const cleaned = cleanPath(url.pathname);
  if (!cleaned) {
    return null;
  }
  const utm: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const clean = cleanUtmValue(url.searchParams.get(key));
    if (clean) {
      utm[key] = clean;
    }
  }
  return { cleaned, utm };
}

function utmQuery(utm: Partial<Record<UtmKey, string>>): string {
  const params = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Referrer handling: same-origin referrers become their cleaned path, other
 * referrers become their hostname only, and "$direct" stays "$direct".
 */
export function cleanReferrer(
  value: unknown,
  origin: string,
): { referrer: string; domain: string } | null {
  if (typeof value !== "string" || value.length > 4096) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === DIRECT) {
    return { referrer: DIRECT, domain: DIRECT };
  }
  if (trimmed.startsWith("/")) {
    const cleaned = cleanPath(trimmed);
    return cleaned ? { referrer: cleaned, domain: new URL(origin).hostname } : null;
  }
  try {
    const url = new URL(trimmed);
    if (url.origin === origin) {
      const cleaned = cleanPath(url.pathname);
      return cleaned ? { referrer: cleaned, domain: url.hostname } : null;
    }
  } catch {
    // Not a URL: fall through to the bare hostname check.
  }
  const domain = cleanReferrerDomain(trimmed);
  return domain ? { referrer: domain, domain } : null;
}

function isClientEventName(value: unknown): value is ClientEventName {
  return typeof value === "string" && (CLIENT_EVENTS as readonly string[]).includes(value);
}

function eventProperties(
  event: ClientEventName,
  raw: Record<string, unknown>,
  page: string,
): SanitizedProperties | null {
  switch (event) {
    case "$pageview":
      return {};
    case "guide_cta_clicked": {
      const slug = raw.guide_slug;
      const position = raw.cta_position;
      const target = raw.cta_target;
      if (
        !isKnownGuideSlug(slug) ||
        page !== `/guides/${slug}` ||
        typeof position !== "string" ||
        !(GUIDE_CTA_POSITIONS as readonly string[]).includes(position) ||
        typeof target !== "string" ||
        !(GUIDE_CTA_TARGETS as readonly string[]).includes(target)
      ) {
        return null;
      }
      return { guide_slug: slug, cta_position: position, cta_target: target };
    }
    case "pro_checkout_started": {
      if (!isCheckoutAnalyticsPlan(raw.plan)) {
        return null;
      }
      const source = cleanPath(raw.source_path) ?? page;
      return { plan: raw.plan, source_path: source };
    }
  }
}

export function sanitizeClientEvent(
  input: unknown,
  context: { origin: string },
): SanitizedClientEvent | null {
  const origin = normalizeOrigin(context.origin);
  if (!origin || !isRecord(input) || !isClientEventName(input.event)) {
    return null;
  }
  const raw = isRecord(input.properties) ? input.properties : null;
  if (!raw) {
    return null;
  }

  const token = raw.token;
  const distinctId = raw.distinct_id;
  if (!isPostHogProjectKey(token) || !isAnalyticsUuid(distinctId)) {
    return null;
  }

  const page = parsePageUrl(raw.$current_url, origin);
  if (!page || isAdminPath(page.cleaned)) {
    return null;
  }

  const specific = eventProperties(input.event, raw, page.cleaned);
  if (!specific) {
    return null;
  }

  const properties: SanitizedProperties = {
    token,
    distinct_id: distinctId,
  };
  if (typeof raw.$process_person_profile === "boolean") {
    properties.$process_person_profile = raw.$process_person_profile;
  }
  for (const key of SDK_BASIC_KEYS) {
    const value = primitive(raw[key]);
    if (value !== undefined) {
      properties[key] = value;
    }
  }

  const workspace = isWorkspacePath(page.cleaned);
  properties.$pathname = page.cleaned;
  properties.$current_url = `${origin}${page.cleaned}${workspace ? "" : utmQuery(page.utm)}`;

  // Logged-in workspace pages: cleaned page views only (Security condition 7).
  if (!workspace) {
    const referrer = cleanReferrer(raw.$referrer, origin);
    if (referrer) {
      properties.$referrer = referrer.referrer;
      properties.$referring_domain = referrer.domain;
    }
    for (const key of UTM_KEYS) {
      const value = page.utm[key] ?? cleanUtmValue(raw[key]);
      if (value) {
        properties[key] = value;
      }
    }
  }

  Object.assign(properties, specific);

  const result: SanitizedClientEvent = { event: input.event, properties };
  if (isAnalyticsUuid(input.uuid)) {
    result.uuid = input.uuid;
  }
  if (input.timestamp instanceof Date && !Number.isNaN(input.timestamp.getTime())) {
    result.timestamp = input.timestamp;
  } else if (
    typeof input.timestamp === "string" &&
    input.timestamp.length <= 40 &&
    !Number.isNaN(Date.parse(input.timestamp))
  ) {
    result.timestamp = input.timestamp;
  }
  return result;
}
