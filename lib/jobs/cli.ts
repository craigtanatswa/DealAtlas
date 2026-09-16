export const JOB_NAMES = [
  "ingest",
  "previews",
  "alerts",
  "renewals",
  "data-quality",
] as const;

export type JobName = (typeof JOB_NAMES)[number];

export const JOB_MODES = ["live", "test", "dry-run"] as const;

export type JobMode = (typeof JOB_MODES)[number];

export type JobCliArgs = {
  job?: JobName;
  mode: JobMode;
  source?: string;
  sources: string[];
  limit?: number;
  cursor?: string;
  updatedFrom?: string;
  updatedTo?: string;
  smoke: boolean;
  force: boolean;
  due: boolean;
  all: boolean;
  dryRun: boolean;
  testEmail?: string;
  changedSince?: string;
};

function asJobName(value: string): JobName | undefined {
  return (JOB_NAMES as readonly string[]).includes(value)
    ? (value as JobName)
    : undefined;
}

function asJobMode(value: string): JobMode | undefined {
  return (JOB_MODES as readonly string[]).includes(value)
    ? (value as JobMode)
    : undefined;
}

export function parseJobArgs(argv: string[]): JobCliArgs {
  const result: JobCliArgs = {
    mode: "live",
    sources: [],
    smoke: false,
    force: false,
    due: false,
    all: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--job" && next) {
      const job = asJobName(next);
      if (job) {
        result.job = job;
      }
      index += 1;
    } else if (arg === "--mode" && next) {
      const mode = asJobMode(next);
      if (mode) {
        result.mode = mode;
      }
      index += 1;
    } else if (arg === "--source" && next) {
      result.source = next;
      result.sources = next.split(",").map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === "--limit" && next) {
      result.limit = Number(next);
      index += 1;
    } else if (arg === "--cursor" && next) {
      result.cursor = next;
      index += 1;
    } else if (arg === "--updated-from" && next) {
      result.updatedFrom = next;
      index += 1;
    } else if (arg === "--updated-to" && next) {
      result.updatedTo = next;
      index += 1;
    } else if (arg === "--changed-since" && next) {
      result.changedSince = next;
      index += 1;
    } else if (arg === "--test-email" && next) {
      result.testEmail = next;
      index += 1;
    } else if (arg === "--smoke") {
      result.smoke = true;
    } else if (arg === "--force") {
      result.force = true;
    } else if (arg === "--due") {
      result.due = true;
    } else if (arg === "--all") {
      result.all = true;
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    }
  }

  if (result.mode === "dry-run" || result.dryRun) {
    result.mode = "dry-run";
    result.dryRun = true;
  }
  if (result.mode === "test") {
    result.smoke = true;
  }
  return result;
}

export const SMOKE_INGEST_LIMIT = 3;
export const LIVE_INGEST_DEFAULT_LIMIT = 500;
export const LIVE_INGEST_HARD_CAP = 2000;

export function ingestLimitForMode(
  mode: JobMode,
  explicit?: number,
  smoke?: boolean,
): number {
  if (explicit != null && Number.isFinite(explicit)) {
    return Math.min(Math.max(1, Math.floor(explicit)), LIVE_INGEST_HARD_CAP);
  }
  if (mode === "test" || mode === "dry-run" || smoke) {
    return SMOKE_INGEST_LIMIT;
  }
  return LIVE_INGEST_DEFAULT_LIMIT;
}

export function triggerTypeFor(
  mode: JobMode,
  scheduled: boolean,
  smoke?: boolean,
): string {
  if (mode === "test" || smoke) {
    return "SMOKE";
  }
  if (mode === "dry-run") {
    return "DRY_RUN";
  }
  return scheduled ? "SCHEDULED" : "MANUAL";
}
