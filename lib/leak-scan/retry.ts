const TRANSIENT_NAMES = new Set(["TimeoutError", "AbortError", "TransientStatus"]);
const TRANSIENT_CODES = new Set([
  "57014",
  "08000",
  "08003",
  "08006",
  "40001",
  "40P01",
  "53300",
  "57P01",
  "PGRST000",
  "PGRST001",
  "PGRST002",
  "PGRST003",
]);

export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  if (TRANSIENT_NAMES.has(name)) return true;
  const code = "code" in error ? String(error.code) : "";
  if (TRANSIENT_CODES.has(code)) return true;
  const message = "message" in error ? String(error.message) : "";
  if (message.startsWith("leak scan ")) return false;
  return /fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|UND_ERR|terminated|timeout/i.test(message);
}

export function transientStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** Three attempts. Backoff is 200ms then 800ms. A non-transient error is not retried. */
export async function withTransientRetries<T>(
  run: () => Promise<T>,
  options: { attempts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      if (!isTransientError(error) || attempt === attempts - 1) throw error;
      await sleep(200 * 4 ** attempt);
    }
  }
  throw last;
}
