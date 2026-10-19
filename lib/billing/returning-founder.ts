/**
 * Returning-founder rule (isolated so it can be removed cleanly).
 *
 * An existing founder (profiles.founding_member, read on the server) keeps the
 * £290 founding product for life: on FOUNDING and on PRO_ANNUAL, even when the
 * cap is full, without a new reservation. A user who already holds an active
 * founding slot, or whom the DB reserve call reports as a founder ("active" or
 * "closed"), also gets the founding product on FOUNDING.
 *
 * To remove the rule: make returningFounderSelection return null and
 * skipsFoundingReservation return false (or delete both call sites in
 * lib/billing/plans.ts), then delete tests/unit/returning-founder.test.ts and
 * supabase/tests/database/founding_returning_cap_full.test.sql. Note the DB
 * reserve_founding_slot still answers "active" for founding_member users (#27).
 */
import type {
  CheckoutPlanKey,
  FoundingReservation,
  PlanProductMap,
} from "@/lib/billing/types";

export function skipsFoundingReservation(founder: boolean): boolean {
  return founder;
}

export function returningFounderSelection(input: {
  planKey: CheckoutPlanKey;
  products: PlanProductMap;
  founder: boolean;
  reservation: FoundingReservation | null;
}): { ok: true; productId: string; founding: true } | null {
  const founding = input.products.FOUNDING_ANNUAL;
  if (!founding || input.planKey === "PRO_MONTHLY") return null;
  if (input.founder) {
    return { ok: true, productId: founding, founding: true };
  }
  // reserve_founding_slot answers "active" for a founding_member (#27) and
  // "closed" for a user who already holds an active slot.
  if (
    input.planKey === "FOUNDING" &&
    (input.reservation === "active" || input.reservation === "closed")
  ) {
    return { ok: true, productId: founding, founding: true };
  }
  return null;
}
