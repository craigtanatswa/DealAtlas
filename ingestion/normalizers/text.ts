import { safeHttpUrl } from "@/lib/deals/urls";

export function blankToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | null {
  if (typeof value === "string") {
    return blankToNull(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function toTimestamptz(value: unknown): string | null {
  const text = asString(value);
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

export function toDateOnly(value: unknown): string | null {
  const timestamp = toTimestamptz(value);
  return timestamp ? timestamp.slice(0, 10) : null;
}

export function normalizeCurrency(value: unknown, fallback = "GBP"): string {
  const text = asString(value)?.toUpperCase();
  if (!text || !/^[A-Z]{3}$/.test(text)) {
    return fallback;
  }
  return text;
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeOrgName(value: string): string {
  return normalizeWhitespace(
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\b(limited|ltd|plc|llp|inc|llc|the|company|co)\b/g, " "),
  );
}

export function normalizeTitle(value: string): string {
  return normalizeWhitespace(value.toLowerCase());
}

export function domainFromWebsite(value: string | null | undefined): string | null {
  const url = safeHttpUrl(value ?? null);
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function formatExactValue(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string,
): string | null {
  const lower = min ?? max ?? null;
  const upper = max ?? min ?? null;
  if (lower == null) {
    return null;
  }

  const format = (amount: number) => {
    const formatted = amount.toLocaleString("en-GB");
    if (currency === "GBP") {
      return `£${formatted}`;
    }
    return `${currency} ${formatted}`;
  };

  if (upper != null && upper !== lower) {
    return `${format(lower)}–${format(upper)}`;
  }
  return format(lower);
}

export function locationText(
  parts: Array<string | null | undefined>,
): string | null {
  const unique = [...new Set(parts.map((part) => blankToNull(part ?? null)).filter(Boolean))];
  return unique.length > 0 ? unique.join(", ") : null;
}

export function countryCodeFrom(value: unknown): string | null {
  const text = asString(value)?.toUpperCase();
  if (!text) {
    return null;
  }
  if (text === "UK" || text === "GBR" || text === "UNITED KINGDOM") {
    return "GB";
  }
  return text.length === 2 ? text : text === "GB" ? "GB" : text.slice(0, 2);
}
