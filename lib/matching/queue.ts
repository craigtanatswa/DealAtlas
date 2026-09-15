import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import { recalculateMatches } from "@/lib/matching/persist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = SupabaseClient<Database>;

type MatchJobRow = {
  id: string;
  company_profile_id: string | null;
  deal_id: string | null;
  status: string;
  cursor_offset: number;
};

function ignoreUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function enqueueProfileMatches(
  companyProfileId: string,
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<void> {
  const { error: clearError } = await admin
    .from("match_jobs")
    .delete()
    .eq("company_profile_id", companyProfileId)
    .is("deal_id", null)
    .in("status", ["PENDING", "ERROR"]);
  throwIfQueryError("Failed to replace queued profile match jobs", {
    data: true,
    error: clearError,
  });
  const { error } = await admin.from("match_jobs").insert({
    company_profile_id: companyProfileId,
    deal_id: null,
    status: "PENDING",
    cursor_offset: 0,
  });
  if (error && !ignoreUniqueViolation(error)) {
    throwIfQueryError("Failed to queue profile match job", { data: true, error });
  }
}

export async function enqueueDealMatches(
  dealId: string,
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<void> {
  const { error: clearError } = await admin
    .from("match_jobs")
    .delete()
    .eq("deal_id", dealId)
    .is("company_profile_id", null)
    .in("status", ["PENDING", "ERROR"]);
  throwIfQueryError("Failed to replace queued deal match jobs", {
    data: true,
    error: clearError,
  });
  const { error } = await admin.from("match_jobs").insert({
    company_profile_id: null,
    deal_id: dealId,
    status: "PENDING",
    cursor_offset: 0,
  });
  if (error && !ignoreUniqueViolation(error)) {
    throwIfQueryError("Failed to queue deal match job", { data: true, error });
  }
}

async function claimJobs(
  admin: AdminClient,
  limit: number,
): Promise<MatchJobRow[]> {
  const { data, error } = await admin
    .from("match_jobs")
    .select("id, company_profile_id, deal_id, status, cursor_offset")
    .eq("status", "PENDING")
    .order("requested_at", { ascending: true })
    .limit(limit);
  const jobs = throwIfQueryError("Failed to list match jobs", {
    data: (data as MatchJobRow[] | null) ?? [],
    error,
  });
  if (jobs.length === 0) {
    return [];
  }
  const ids = jobs.map((job) => job.id);
  const { error: updateError } = await admin
    .from("match_jobs")
    .update({ status: "RUNNING" })
    .in("id", ids)
    .eq("status", "PENDING");
  throwIfQueryError("Failed to claim match jobs", { data: true, error: updateError });
  return jobs;
}

async function finishJob(
  admin: AdminClient,
  job: MatchJobRow,
  result: { remaining: boolean; nextOffset: number },
  errorMessage?: string,
): Promise<void> {
  if (errorMessage) {
    const { error } = await admin
      .from("match_jobs")
      .update({
        status: "ERROR",
        processed_at: new Date().toISOString(),
        error_message: errorMessage.slice(0, 500),
      })
      .eq("id", job.id);
    throwIfQueryError("Failed to mark match job error", { data: true, error });
    return;
  }

  const { error } = await admin
    .from("match_jobs")
    .update({
      status: "DONE",
      processed_at: new Date().toISOString(),
      cursor_offset: result.nextOffset,
      error_message: null,
    })
    .eq("id", job.id);
  throwIfQueryError("Failed to complete match job", { data: true, error });

  if (result.remaining) {
    const { error: insertError } = await admin.from("match_jobs").insert({
      company_profile_id: job.company_profile_id,
      deal_id: job.deal_id,
      status: "PENDING",
      cursor_offset: result.nextOffset,
    });
    if (insertError && !ignoreUniqueViolation(insertError)) {
      throwIfQueryError("Failed to continue match job", {
        data: true,
        error: insertError,
      });
    }
  }
}

export async function processMatchJobs(options?: {
  limit?: number;
  maxPairs?: number;
  admin?: AdminClient;
}): Promise<{ processed: number; written: number }> {
  const admin = options?.admin ?? createSupabaseAdminClient();
  const jobs = await claimJobs(admin, options?.limit ?? 5);
  let written = 0;
  for (const job of jobs) {
    try {
      const result = await recalculateMatches({
        admin,
        companyProfileId: job.company_profile_id,
        dealId: job.deal_id,
        cursorOffset: job.cursor_offset ?? 0,
        maxPairs: options?.maxPairs ?? 120,
      });
      written += result.written;
      await finishJob(admin, job, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Match job failed";
      await finishJob(admin, job, { remaining: false, nextOffset: job.cursor_offset ?? 0 }, message);
    }
  }
  return { processed: jobs.length, written };
}

export async function enqueueAndProcessProfileMatches(
  companyProfileId: string,
  options?: { maxPairs?: number },
): Promise<void> {
  const admin = createSupabaseAdminClient();
  await enqueueProfileMatches(companyProfileId, admin);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { processed } = await processMatchJobs({
      admin,
      limit: 2,
      maxPairs: options?.maxPairs ?? 80,
    });
    if (processed === 0) {
      break;
    }
  }
}

export async function enqueueAndProcessDealMatches(
  dealId: string,
  options?: { maxPairs?: number },
): Promise<void> {
  const admin = createSupabaseAdminClient();
  await enqueueDealMatches(dealId, admin);
  await processMatchJobs({
    admin,
    limit: 3,
    maxPairs: options?.maxPairs ?? 80,
  });
}
