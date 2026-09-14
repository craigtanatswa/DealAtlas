import { IngestionError } from "@/ingestion/core/errors";

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  isRetryable?: (error: unknown) => boolean;
};

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 8_000;

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isRetryableIngestionError(error: unknown): boolean {
  if (error instanceof IngestionError) {
    return error.retryable;
  }
  return false;
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const isRetryable = options.isRetryable ?? isRetryableIngestionError;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }

      const retryAfter =
        error instanceof IngestionError &&
        typeof error.details.retryAfterMs === "number"
          ? error.details.retryAfterMs
          : null;
      const exponential = Math.min(
        maxDelayMs,
        baseDelayMs * 2 ** (attempt - 1),
      );
      await sleep(retryAfter ?? exponential);
    }
  }

  throw lastError;
}

export function retryAfterToMs(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) {
    return null;
  }

  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(60_000, seconds * 1000);
  }

  const date = Date.parse(retryAfterHeader);
  if (Number.isNaN(date)) {
    return null;
  }

  return Math.max(0, Math.min(60_000, date - Date.now()));
}
