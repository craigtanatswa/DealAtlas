import type { Database, Json } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import type { JobMode, JobName } from "@/lib/jobs/cli";
import type { IngestionSupabaseClient } from "@/ingestion/store/worker-client";

export type JobRunStatus = Database["public"]["Enums"]["ingestion_status"];

export type JobRunRecord = {
  id: string;
  jobName: JobName;
  triggerType: string;
  status: JobRunStatus;
  mode: JobMode;
  startedAt: string;
  finishedAt: string | null;
  summary: Record<string, unknown>;
  errorMessage: string | null;
};

export async function startJobRun(
  client: IngestionSupabaseClient,
  input: {
    jobName: JobName;
    triggerType: string;
    mode: JobMode;
    summary?: Record<string, unknown>;
  },
): Promise<JobRunRecord> {
  const result = await client
    .from("job_runs")
    .insert({
      job_name: input.jobName,
      trigger_type: input.triggerType,
      status: "RUNNING",
      mode: input.mode,
      summary: (input.summary ?? {}) as Json,
    })
    .select(
      "id, job_name, trigger_type, status, mode, started_at, finished_at, summary, error_message",
    )
    .single();
  const row = throwIfQueryError("Start job run", result);
  if (!row) {
    throw new Error("Start job run: no row returned");
  }
  return mapJobRun(row);
}

export async function finishJobRun(
  client: IngestionSupabaseClient,
  id: string,
  patch: {
    status: JobRunStatus;
    summary?: Record<string, unknown>;
    errorMessage?: string | null;
  },
): Promise<void> {
  const result = await client
    .from("job_runs")
    .update({
      status: patch.status,
      finished_at: new Date().toISOString(),
      summary: (patch.summary ?? {}) as Json,
      error_message: patch.errorMessage ?? null,
    })
    .eq("id", id);
  throwIfQueryError("Finish job run", { data: true, error: result.error });
}

type JobRunRow = {
  id: string;
  job_name: string;
  trigger_type: string;
  status: JobRunStatus;
  mode: string;
  started_at: string;
  finished_at: string | null;
  summary: Json;
  error_message: string | null;
};

function mapJobRun(row: JobRunRow): JobRunRecord {
  return {
    id: row.id,
    jobName: row.job_name as JobName,
    triggerType: row.trigger_type,
    status: row.status,
    mode: row.mode as JobMode,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    summary:
      row.summary && typeof row.summary === "object" && !Array.isArray(row.summary)
        ? (row.summary as Record<string, unknown>)
        : {},
    errorMessage: row.error_message,
  };
}
