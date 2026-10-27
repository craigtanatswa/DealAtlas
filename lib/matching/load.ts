import "server-only";

import type { PublicSupabaseClient } from "@/lib/db/previews";
import { throwIfQueryError } from "@/lib/db/errors";
import { parseStoredDetailReasons, parseStoredReasons } from "@/lib/matching/reasons";
import { MATCH_DETAIL_SELECT } from "@/lib/matching/types";
import type { ProMatchView, SafeMatchView, SanitisedMatchReason } from "@/lib/matching/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PRO_REASON_LIMIT = 8;

/** Pro-only view. Callers must pass the match-access gate first. */
export function toSafeMatchView(
  score: number,
  reasons: SanitisedMatchReason[],
): SafeMatchView {
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: reasons.slice(0, PRO_REASON_LIMIT),
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
  const detail = parseStoredDetailReasons(row.detail_reasons);
  const mismatches = [
    ...preview.filter((reason) => reason.kind === "mismatch"),
    ...detail.filter((reason) => reason.kind === "mismatch"),
  ].slice(0, PRO_REASON_LIMIT);
  return {
    ...toSafeMatchView(Number(row.relevance_score), preview),
    mismatches,
  };
}
