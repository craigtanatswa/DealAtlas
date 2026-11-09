const MINUTE_MS = 60_000;

function envMinutesToMs(name: string, fallbackMinutes: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallbackMinutes * MINUTE_MS;
  }
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return fallbackMinutes * MINUTE_MS;
  }
  return Math.round(minutes * MINUTE_MS);
}

/** Runs still RUNNING/QUEUED after this are closed as timed out before a new run starts. */
export const STALE_RUN_LIMIT_MS = envMinutesToMs(
  "INGEST_STALE_RUN_LIMIT_MINUTES",
  2 * 60,
);

/** Hard limit for one ingestion run body. */
export const RUN_TIMEOUT_MS = envMinutesToMs("INGEST_RUN_TIMEOUT_MINUTES", 90);
