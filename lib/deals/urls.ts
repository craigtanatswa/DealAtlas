const BLOCKED_PROTOCOLS = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "blob:",
]);

/**
 * Allow only http(s) URLs for Pro "open original source" actions.
 * Rejects protocol-relative, nested credentials, and non-web schemes.
 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if ([...BLOCKED_PROTOCOLS].some((protocol) => lowered.startsWith(protocol))) {
    return null;
  }
  if (trimmed.startsWith("//") || trimmed.includes("\\")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    if (!parsed.hostname) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
