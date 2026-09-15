import "server-only";

import type { PublicSupabaseClient } from "@/lib/db/previews";
import { throwIfQueryError } from "@/lib/db/errors";
import { parseStoredReasons } from "@/lib/matching/reasons";
import { MATCH_DETAIL_SELECT, MATCH_PREVIEW_SELECT } from "@/lib/matching/types";
import type { ProMatchView, SafeMatchView, SanitisedMatchReason } from "@/lib/matching/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const FREE_REASON_LIMIT = 3;
const PRO_REASON_LIMIT = 8;

function limitedReasons(
  reasons: SanitisedMatchReason[],
  mode: "free" | "pro",
): SanitisedMatchReason[] {
  if (mode === "pro") {
    return reasons.slice(0, PRO_REASON_LIMIT);
  }
  return reasons
    .filter(
      (reason) =>
        reason.kind === "match" ||
        reason.code === "NEGATIVE_KEYWORD" ||
        reason.code === "PROFILE_LIMITED",
    )
    .slice(0, FREE_REASON_LIMIT);
}

export function toSafeMatchView(
  score: number,
  reasons: SanitisedMatchReason[],
  mode: "free" | "pro" = "free",
): SafeMatchView {
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: limitedReasons(reasons, mode),
  };
}

export async function loadCompanyProfileIdForUser(
  client: PublicSupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("company_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  const row = throwIfQueryError("Failed to load company profile id", {
    data,
    error,
  });
  return row?.id ?? null;
}

export async function loadSafeMatchForDeal(input: {
  client: PublicSupabaseClient;
  companyProfileId: string;
  dealId: string;
}): Promise<SafeMatchView | null> {
  const { data, error } = await input.client
    .from("deal_matches")
    .select(MATCH_PREVIEW_SELECT)
    .eq("company_profile_id", input.companyProfileId)
    .eq("deal_id", input.dealId)
    .maybeSingle();
  const row = throwIfQueryError("Failed to load deal match", {
    data,
    error,
  });
  if (!row) {
    return null;
  }
  return toSafeMatchView(Number(row.relevance_score), parseStoredReasons(row.preview_reasons));
}

export async function loadSafeMatchesForDeals(input: {
  client: PublicSupabaseClient;
  companyProfileId: string;
  dealIds: string[];
}): Promise<Map<string, SafeMatchView>> {
  const result = new Map<string, SafeMatchView>();
  if (input.dealIds.length === 0) {
    return result;
  }
  const { data, error } = await input.client
    .from("deal_matches")
    .select(MATCH_PREVIEW_SELECT)
    .eq("company_profile_id", input.companyProfileId)
    .in("deal_id", input.dealIds);
  const rows = throwIfQueryError("Failed to load deal matches", {
    data: data ?? [],
    error,
  });
  for (const row of rows) {
    result.set(
      row.deal_id,
      toSafeMatchView(Number(row.relevance_score), parseStoredReasons(row.preview_reasons)),
    );
  }
  return result;
}

export async function loadProMatchForDeal(input: {
  companyProfileId: string;
  dealId: string;
}): Promise<ProMatchView | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("deal_matches")
    .select(MATCH_DETAIL_SELECT)
    .eq("company_profile_id", input.companyProfileId)
    .eq("deal_id", input.dealId)
    .maybeSingle();
  const row = throwIfQueryError("Failed to load entitled deal match", {
    data,
    error,
  });
  if (!row) {
    return null;
  }
  const preview = parseStoredReasons(row.preview_reasons);
  const detail = parseStoredReasons(row.detail_reasons);
  const mismatches = [
    ...preview.filter((reason) => reason.kind === "mismatch"),
    ...detail.filter((reason) => reason.kind === "mismatch"),
  ].slice(0, PRO_REASON_LIMIT);
  return {
    ...toSafeMatchView(Number(row.relevance_score), preview, "pro"),
    mismatches,
  };
}
