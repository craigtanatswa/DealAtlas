import "server-only";

import type { PublicSupabaseClient } from "@/lib/db/previews";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { loadCompanyProfileIdForUser, toSafeMatchView } from "@/lib/matching/load";
import { parseStoredReasons } from "@/lib/matching/reasons";
import type { SafeMatchView } from "@/lib/matching/types";

/**
 * Match access for one viewer. Match scores, reasons and match-based ordering
 * are derived from protected deal fields, so only Pro viewers get them.
 */
export type MatchAccess = {
  /** True only for a paid-through Pro viewer with a saved company profile. */
  enabled: boolean;
  /** The viewer's own profile id. UI prompts only; never a match signal. */
  companyProfileId: string | null;
};

export const NO_MATCH_ACCESS: MatchAccess = Object.freeze({
  enabled: false,
  companyProfileId: null,
});

export type MatchAccessDeps = {
  isPro: (userId: string) => Promise<boolean>;
  loadCompanyProfileId: (userId: string) => Promise<string | null>;
};

/**
 * Single server-side gate for match data. Fails closed: any error resolving
 * the entitlement is treated as not Pro. Mirrors private.is_user_pro via the
 * subscriptions mirror (lib/entitlements/policy.ts).
 */
export async function resolveMatchAccessWith(
  userId: string | null | undefined,
  deps: MatchAccessDeps,
): Promise<MatchAccess> {
  if (!userId) {
    return NO_MATCH_ACCESS;
  }
  const companyProfileId = await deps.loadCompanyProfileId(userId);
  let pro = false;
  try {
    pro = (await deps.isPro(userId)) === true;
  } catch {
    pro = false;
  }
  return { enabled: pro && companyProfileId !== null, companyProfileId };
}

export function resolveMatchAccess(
  client: PublicSupabaseClient,
  userId: string | null | undefined,
): Promise<MatchAccess> {
  return resolveMatchAccessWith(userId, {
    isPro: async (id) => isProEntitlement(await getCurrentEntitlement(id)),
    loadCompanyProfileId: (id) => loadCompanyProfileIdForUser(client, id),
  });
}

/** Match view for one row, or null unless the gate allows match data. */
export function gatedRowMatch(
  access: MatchAccess,
  row: { relevance_score?: number | string | null; preview_reasons?: unknown },
): SafeMatchView | null {
  if (!access.enabled || row.relevance_score == null) {
    return null;
  }
  return toSafeMatchView(Number(row.relevance_score), parseStoredReasons(row.preview_reasons));
}
