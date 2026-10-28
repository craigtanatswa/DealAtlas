import {
  DEAL_CATEGORY_CATALOG,
  type DealCategorySlug,
} from "@/lib/matching/categories";

export const ALERTS_SIGNUP_ENDPOINT = "/api/alerts/signup";

export const ALERTS_PENDING_MESSAGE = "Check your inbox to confirm your alerts.";

export type AlertsOutcome = "pending" | "invalid" | "rate_limited";

export type AlertsSignupResult =
  | { outcome: "pending" }
  | { outcome: "invalid"; error: "INVALID_EMAIL" | "CONSENT_REQUIRED" }
  | { outcome: "rate_limited"; retryAfterSeconds: number | null }
  | { outcome: "error" };

export function alertsCategorySlug(
  raw: string | null | undefined,
): DealCategorySlug {
  if (!raw) {
    return "other";
  }
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return "other";
  }
  const match = DEAL_CATEGORY_CATALOG.find(
    (category) =>
      category.slug.toLowerCase() === normalized ||
      category.name.toLowerCase() === normalized,
  );
  return match ? match.slug : "other";
}

function invalidError(value: unknown): "INVALID_EMAIL" | "CONSENT_REQUIRED" {
  return value === "CONSENT_REQUIRED" ? "CONSENT_REQUIRED" : "INVALID_EMAIL";
}

function retryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (header === null) {
    return null;
  }
  const seconds = Number.parseInt(header, 10);
  return Number.isNaN(seconds) ? null : seconds;
}

export async function submitAlertsSignup(
  input: {
    email: string;
    consent: boolean;
    website: string;
    dealSlug?: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<AlertsSignupResult> {
  const body = {
    email: input.email,
    ...(input.dealSlug !== undefined ? { dealSlug: input.dealSlug } : {}),
    consent: input.consent,
    source: "deal_page",
    website: input.website,
  };

  try {
    const response = await fetchImpl(ALERTS_SIGNUP_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 202) {
      return { outcome: "pending" };
    }

    if (response.status === 400) {
      try {
        const payload: unknown = await response.json();
        const error =
          typeof payload === "object" && payload !== null
            ? (payload as { error?: unknown }).error
            : undefined;
        return { outcome: "invalid", error: invalidError(error) };
      } catch {
        return { outcome: "invalid", error: "INVALID_EMAIL" };
      }
    }

    if (response.status === 429) {
      return {
        outcome: "rate_limited",
        retryAfterSeconds: retryAfterSeconds(response),
      };
    }

    return { outcome: "error" };
  } catch {
    return { outcome: "error" };
  }
}
