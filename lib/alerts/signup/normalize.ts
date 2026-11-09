/** Trim + lowercase. Empty string if unusable. */
export function normalizeAlertEmail(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 320) {
    return null;
  }
  return normalized;
}
