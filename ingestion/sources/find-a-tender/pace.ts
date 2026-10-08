/** Stay under the observed Find a Tender limit of about 12 requests per 120s. */
export const FIND_A_TENDER_REQUEST_LIMIT = 10;
export const FIND_A_TENDER_REQUEST_WINDOW_MS = 120_000;

export function createRequestPacer(options: {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
  sleep: (ms: number) => Promise<void>;
}): () => Promise<void> {
  const maxRequests = options.maxRequests ?? FIND_A_TENDER_REQUEST_LIMIT;
  const windowMs = options.windowMs ?? FIND_A_TENDER_REQUEST_WINDOW_MS;
  const now = options.now ?? (() => Date.now());
  const stamps: number[] = [];

  return async () => {
    const current = now();
    while (stamps.length > 0 && current - (stamps[0] ?? current) >= windowMs) {
      stamps.shift();
    }
    if (stamps.length >= maxRequests) {
      const wait = (stamps[0] ?? current) + windowMs - current;
      if (wait > 0) {
        await options.sleep(wait);
      }
      const after = now();
      while (stamps.length > 0 && after - (stamps[0] ?? after) >= windowMs) {
        stamps.shift();
      }
    }
    stamps.push(now());
  };
}
