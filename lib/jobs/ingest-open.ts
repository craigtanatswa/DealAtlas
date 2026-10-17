import {
  createAllowlistedJsonClient,
  type AllowedFetchPolicy,
  type JsonHttpClient,
} from "@/ingestion/core/http";
import { runIngestion } from "@/ingestion/core/pipeline";
import { defaultSleep } from "@/ingestion/core/retry";
import { createContractsFinderAdapter } from "@/ingestion/sources/contracts-finder/adapter";
import {
  CONTRACTS_FINDER_FETCH_POLICY,
  CONTRACTS_FINDER_SOURCE_KEY,
} from "@/ingestion/sources/contracts-finder/constants";
import { createFindATenderAdapter } from "@/ingestion/sources/find-a-tender/adapter";
import {
  FIND_A_TENDER_FETCH_POLICY,
  FIND_A_TENDER_SOURCE_KEY,
  formatOcdsDateTime,
} from "@/ingestion/sources/find-a-tender/constants";
import {
  FIND_A_TENDER_REQUEST_LIMIT,
  FIND_A_TENDER_REQUEST_WINDOW_MS,
  createRequestPacer,
} from "@/ingestion/sources/find-a-tender/pace";
import { createPublicContractsScotlandAdapter } from "@/ingestion/sources/public-contracts-scotland/adapter";
import {
  PUBLIC_CONTRACTS_SCOTLAND_FETCH_POLICY,
  PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
} from "@/ingestion/sources/public-contracts-scotland/constants";
import { createSell2WalesAdapter } from "@/ingestion/sources/sell2wales/adapter";
import {
  SELL2WALES_FETCH_POLICY,
  SELL2WALES_SOURCE_KEY,
} from "@/ingestion/sources/sell2wales/constants";
import type { SourceAdapter } from "@/ingestion/core/types";
import type { IngestionStore } from "@/ingestion/store/types";
import { rebuildChangedPreviews } from "@/lib/jobs/previews";

export type OpenIngestCounts = {
  fetched: number;
  new: number;
  updated: number;
  unchanged: number;
  failed: number;
  /** 1 when the record cap stopped the run before the window was finished. */
  capped: number;
};

export type OpenIngestError = {
  stage: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type OpenIngestResult = {
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";
  dryRun: boolean;
  counts: OpenIngestCounts;
  changedDealIds: string[];
  errors: OpenIngestError[];
};

const MISSING_PREVIEW_CAP = 500;

function safeErrorText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "")
    .replace(/\b(?:eyJ|sb_secret|sb_publishable|sk_|rk_|whsec_)[A-Za-z0-9._-]{8,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function redactSecrets(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]")
    .replace(/\b(?:eyJ|sb_secret|sb_publishable|sk_|rk_|whsec_)[A-Za-z0-9._-]{8,}\b/g, "[secret]");
}

function errorCode(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const code = (value as { code?: unknown }).code;
  if (typeof code !== "string") return undefined;
  const trimmed = code.trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(trimmed)) return undefined;
  return trimmed;
}

function errorHint(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const hint = (value as { hint?: unknown }).hint;
  if (typeof hint !== "string" || !hint.trim()) return undefined;
  return redactSecrets(hint).replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Fatal lines keep the message, code and stack. URLs, emails and tokens are removed. */
export function publicFatalErrorLine(err: unknown): string {
  const lines: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;
  for (let depth = 0; current != null && depth < 4 && !seen.has(current); depth += 1) {
    seen.add(current);
    const plainMessage =
      current && typeof current === "object" && "message" in current &&
      typeof (current as { message?: unknown }).message === "string"
        ? (current as { message: string }).message
        : undefined;
    const asError =
      current instanceof Error
        ? current
        : new Error(typeof current === "string" ? current : plainMessage || "ingest failed");
    const code = errorCode(current) ?? (depth === 0 ? "UNEXPECTED" : "-");
    const message = redactSecrets(asError.message || "ingest failed")
      .replace(/[ \t]+/g, " ")
      .trim()
      .slice(0, 500);
    lines.push(depth === 0 ? `fatal ${code} ${message || "-"}` : `cause ${code} ${message || "-"}`);
    const hint = errorHint(current);
    if (hint) lines.push(`hint ${hint}`);
    if (asError.stack) {
      for (const frame of redactSecrets(asError.stack).split("\n").slice(1, 8)) {
        const trimmed = frame.trim();
        if (trimmed) lines.push(trimmed);
      }
    }
    const cause =
      current instanceof Error
        ? current.cause
        : current && typeof current === "object"
          ? (current as { cause?: unknown }).cause
          : undefined;
    current = cause;
  }
  return lines.join("\n").slice(0, 4000);
}

/** Fetch lines are stage, code, status, host. Parse lines are stage, code, field path. Record lines keep the database code, message and details. */
export function publicIngestErrorLine(error: OpenIngestError): string {
  if (error.stage === "record") {
    const dbCode =
      typeof error.details?.dbCode === "string" && error.details.dbCode.trim()
        ? safeErrorText(error.details.dbCode)
        : "-";
    const message = safeErrorText(error.message) || "-";
    const dbDetails =
      typeof error.details?.dbDetails === "string" ? safeErrorText(error.details.dbDetails) : "";
    return `record ${error.code} ${dbCode} ${message}${dbDetails ? ` ${dbDetails}` : ""}`;
  }
  if (error.stage === "parse") {
    const paths = error.message
      .split(",")
      .map((part) => part.trim())
      .filter((part) => /^[A-Za-z0-9_.[\]]+$/.test(part));
    return `${error.stage} ${error.code} ${paths.join(",") || "-"}`;
  }
  return `${error.stage} ${error.code} ${publicStatus(error)} ${publicHost(error.message)}`;
}

export function openIngestShouldFail(result: OpenIngestResult): boolean {
  if (result.status === "FAILED") {
    return true;
  }
  const fetchFailed = result.errors.some(
    (error) =>
      error.stage === "discover" || error.stage === "fetch" || error.stage === "run",
  );
  if (fetchFailed) {
    return true;
  }
  const parseOnly =
    result.errors.length > 0 &&
    result.errors.every((error) => error.stage === "parse" || error.stage === "record");
  if (parseOnly) {
    const succeeded = result.counts.new + result.counts.updated + result.counts.unchanged;
    return succeeded === 0;
  }
  return result.status === "PARTIAL" && result.counts.capped === 0 && result.counts.failed > 0;
}

function publicStatus(error: OpenIngestError): string {
  const fromCode = /^HTTP_(\d{3})$/.exec(error.code);
  if (fromCode) {
    return fromCode[1];
  }
  const fromMessage = /\bHTTP (\d{3})\b/.exec(error.message);
  if (fromMessage) {
    return fromMessage[1];
  }
  const cause = /^([A-Z][A-Z0-9_]{2,64})\b/.exec(error.message);
  return cause?.[1] ?? "-";
}

function publicHost(message: string): string {
  const url = /https?:\/\/\S+/i.exec(message);
  if (url) {
    try {
      return new URL(url[0]).hostname;
    } catch {
      return "-";
    }
  }
  const host = message.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i);
  return host?.[0] ?? "-";
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 7 * DAY_MS;
const MAX_BACKFILL_DAYS = 366;
const MAX_RECORDS = 10000;

export function openIngestWindows(
  now: Date,
  backfillDays: number,
): Array<{ updatedFrom: string; updatedTo: string }> {
  const days = Math.min(
    MAX_BACKFILL_DAYS,
    Math.max(1, Math.floor(backfillDays)),
  );
  const end = now.getTime();
  let cursor = end - days * DAY_MS;
  const windows: Array<{ updatedFrom: string; updatedTo: string }> = [];
  while (cursor < end) {
    const next = Math.min(end, cursor + WINDOW_MS);
    windows.push({
      updatedFrom: formatOcdsDateTime(new Date(cursor)),
      updatedTo: formatOcdsDateTime(new Date(next)),
    });
    cursor = next;
  }
  return windows;
}

function emptyCounts(): OpenIngestCounts {
  return { fetched: 0, new: 0, updated: 0, unchanged: 0, failed: 0, capped: 0 };
}

export const OPEN_INGEST_SOURCE_KEYS = [
  FIND_A_TENDER_SOURCE_KEY,
  CONTRACTS_FINDER_SOURCE_KEY,
  PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
  SELL2WALES_SOURCE_KEY,
] as const;

export type OpenIngestSourceKey = (typeof OPEN_INGEST_SOURCE_KEYS)[number];

/** Devolved portals stay at or under 10 requests a minute. Find a Tender stays slower. */
export function openIngestPacerOptions(sourceKey: string): {
  maxRequests: number;
  windowMs: number;
} {
  if (
    sourceKey === PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY ||
    sourceKey === SELL2WALES_SOURCE_KEY
  ) {
    return { maxRequests: 10, windowMs: 60_000 };
  }
  return {
    maxRequests: FIND_A_TENDER_REQUEST_LIMIT,
    windowMs: FIND_A_TENDER_REQUEST_WINDOW_MS,
  };
}

/** Find a Tender starts the changed-id file. Later sources append so a failure cannot drop it. */
export function mergeOpenIngestChangedIds(
  source: string,
  prior: string[],
  current: string[],
): string[] {
  const base = source === FIND_A_TENDER_SOURCE_KEY ? [] : prior;
  return [...new Set([...base, ...current])];
}

export function openIngestLogLine(counts: OpenIngestCounts): string {
  return JSON.stringify({
    fetched: counts.fetched,
    new: counts.new,
    updated: counts.updated,
    unchanged: counts.unchanged,
    failed: counts.failed,
    capped: counts.capped,
  });
}

export async function runOpenFindATenderIngest(options: {
  store: IngestionStore;
  now?: Date;
  dryRun: boolean;
  backfillDays: number;
  adapter?: SourceAdapter;
  http?: JsonHttpClient;
  sleep?: (ms: number) => Promise<void>;
  limit?: number;
  /** ingest writes canonical rows. previews rebuilds changed deals. all does both. */
  phase?: "ingest" | "previews" | "all";
  dealIds?: string[];
  sourceKey?: OpenIngestSourceKey;
}): Promise<OpenIngestResult> {
  const now = options.now ?? new Date();
  const sleep = options.sleep ?? defaultSleep;
  const sourceKey = options.sourceKey ?? FIND_A_TENDER_SOURCE_KEY;
  const pace = createRequestPacer({ sleep, ...openIngestPacerOptions(sourceKey) });
  const http =
    options.http ?? createAllowlistedJsonClient(fetchPolicyFor(sourceKey));
  const paced: JsonHttpClient = {
    async getJson(url: string) {
      await pace();
      return http.getJson(url);
    },
  };
  const adapter = options.adapter ?? adapterFor(sourceKey, paced, () => now);

  const counts = emptyCounts();
  const errors: OpenIngestError[] = [];
  const changed = new Set<string>(options.dealIds ?? []);
  const phase = options.phase ?? "all";
  const recordCap = options.limit ?? MAX_RECORDS;
  let remaining = recordCap;
  let status: OpenIngestResult["status"] = "SUCCEEDED";
  let capped = false;

  if (phase !== "previews") {
    for (const window of openIngestWindows(now, options.backfillDays)) {
      if (remaining <= 0) {
        capped = true;
        status = "PARTIAL";
        break;
      }
      const result = await runIngestion({
        sourceKey,
        store: options.store,
        adapter,
        triggerType: options.dryRun ? "DRY_RUN" : "SCHEDULED",
        limit: remaining,
        updatedFrom: window.updatedFrom,
        updatedTo: window.updatedTo,
        stages: "tender",
        now,
        force: true,
        pageSize: 100,
        minFetchIntervalMs: 0,
        sleep,
        dryRun: options.dryRun,
        skipPreview: true,
        failureMode: "partial",
        onPersisted: (info) => {
          if (info.outcome === "new" || info.outcome === "updated" || info.outcome === "linked") {
            changed.add(info.dealId);
          }
        },
      });

      counts.fetched += result.counters.fetched;
      counts.new += result.counters.new;
      counts.updated += result.counters.updated;
      counts.unchanged += result.counters.unchanged;
      counts.failed += result.counters.errorCount;
      remaining -= result.counters.fetched;
      for (const error of result.errors) {
        errors.push({
          stage: error.stage,
          code: error.code ?? "INGESTION_ERROR",
          message: error.message,
          details: error.details,
        });
      }

      if (result.status === "SKIPPED") {
        return {
          status: "SKIPPED",
          dryRun: options.dryRun,
          counts,
          changedDealIds: [],
          errors,
        };
      }
      const fetchLevel =
        result.status === "FAILED" ||
        result.errors.some(
          (error) =>
            error.stage === "discover" ||
            error.stage === "fetch" ||
            error.stage === "run",
        );
      if (fetchLevel) {
        status = "PARTIAL";
        break;
      }
      if (result.status === "PARTIAL") {
        status = "PARTIAL";
      }
      if (remaining <= 0) {
        capped = true;
        status = "PARTIAL";
        break;
      }
    }
  }

  if (capped) {
    counts.capped = 1;
    status = "PARTIAL";
  }

  const previewIds = phase === "ingest" ? [] : [...changed];
  if (!options.dryRun && phase !== "ingest") {
    const missing = await options.store.listDealIdsMissingPreview(MISSING_PREVIEW_CAP);
    const seen = new Set(previewIds);
    for (const dealId of missing) {
      if (seen.has(dealId)) continue;
      seen.add(dealId);
      previewIds.push(dealId);
    }
  }
  if (!options.dryRun && previewIds.length > 0 && phase !== "ingest") {
    const previews = await rebuildChangedPreviews({
      store: options.store,
      now,
      mode: "live",
      changedSince: now.toISOString(),
      dealIds: previewIds,
      limit: previewIds.length,
      countsOnly: true,
    });
    if (phase === "previews") {
      counts.fetched = previews.selected;
      counts.new = previews.published;
      counts.updated = previews.processed;
      counts.unchanged = previews.blocked;
    }
    counts.failed += previews.failures;
    if (previews.failures > 0) {
      status = "PARTIAL";
    }
  }

  if (counts.failed === 0 && status !== "PARTIAL") {
    status = "SUCCEEDED";
  }

  return {
    status,
    dryRun: options.dryRun,
    counts,
    changedDealIds: phase === "previews" ? [] : [...changed],
    errors,
  };
}

function fetchPolicyFor(sourceKey: OpenIngestSourceKey): AllowedFetchPolicy {
  switch (sourceKey) {
    case CONTRACTS_FINDER_SOURCE_KEY:
      return CONTRACTS_FINDER_FETCH_POLICY;
    case PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY:
      return PUBLIC_CONTRACTS_SCOTLAND_FETCH_POLICY;
    case SELL2WALES_SOURCE_KEY:
      return SELL2WALES_FETCH_POLICY;
    default:
      return FIND_A_TENDER_FETCH_POLICY;
  }
}

function adapterFor(
  sourceKey: OpenIngestSourceKey,
  http: JsonHttpClient,
  now: () => Date,
): SourceAdapter {
  switch (sourceKey) {
    case CONTRACTS_FINDER_SOURCE_KEY:
      return createContractsFinderAdapter({ http, now });
    case PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY:
      return createPublicContractsScotlandAdapter({ http, now });
    case SELL2WALES_SOURCE_KEY:
      return createSell2WalesAdapter({ http, now });
    default:
      return createFindATenderAdapter({ http, now });
  }
}

export function runOpenContractsFinderIngest(
  options: Omit<Parameters<typeof runOpenFindATenderIngest>[0], "sourceKey">,
): Promise<OpenIngestResult> {
  return runOpenFindATenderIngest({
    ...options,
    sourceKey: CONTRACTS_FINDER_SOURCE_KEY,
  });
}

export function runOpenPublicContractsScotlandIngest(
  options: Omit<Parameters<typeof runOpenFindATenderIngest>[0], "sourceKey">,
): Promise<OpenIngestResult> {
  return runOpenFindATenderIngest({
    ...options,
    sourceKey: PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
  });
}

export function runOpenSell2WalesIngest(
  options: Omit<Parameters<typeof runOpenFindATenderIngest>[0], "sourceKey">,
): Promise<OpenIngestResult> {
  return runOpenFindATenderIngest({
    ...options,
    sourceKey: SELL2WALES_SOURCE_KEY,
  });
}
