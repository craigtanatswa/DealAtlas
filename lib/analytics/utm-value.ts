const UTM_VALUE_RE = /^[a-z0-9_-]{1,64}$/;

/**
 * Normalises one UTM value for server-side storage: trimmed and lowercased,
 * at most 64 chars of [a-z0-9_-]. Anything else becomes "other"; a missing or
 * blank value is null.
 */
export function sanitizeUtmValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return null;
  return UTM_VALUE_RE.test(trimmed) ? trimmed : "other";
}
