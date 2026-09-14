import { uuidSchema } from "@/lib/validation";
import type { PaidDealDto } from "@/lib/deals/paid-dto";
import { isProEntitlement } from "@/lib/entitlements/policy";
import type {
  EntitlementSnapshot,
  ProCanonicalAccess,
} from "@/lib/entitlements/types";

export const PROTECTED_DEAL_ERROR = {
  UNAUTHENTICATED: "Authentication required to access protected deal data.",
  FORBIDDEN:
    "Protected deal data is not available without a verified Pro subscription.",
  INVALID_ID: "Invalid deal id.",
  NOT_FOUND: "Deal not found.",
} as const;

export type ProtectedDealLoad = (
  dealId: string,
  access: ProCanonicalAccess,
) => Promise<PaidDealDto | null>;

export type ProtectedDealRequestInput = {
  userId: string | null;
  dealId: unknown;
  entitlement: EntitlementSnapshot | null;
  /**
   * Client-supplied plan labels, query params, or headers. Ignored.
   * Present so tests can prove tampering does not grant Pro.
   */
  clientClaimedPlan?: unknown;
  loadPaidDeal: ProtectedDealLoad;
};

export type ProtectedDealResponse =
  | {
      status: 200;
      body: PaidDealDto;
    }
  | {
      status: 400 | 401 | 403 | 404;
      body: { error: string; code: string };
    };

/**
 * Protected Deal gate used by the API route (and future server actions).
 * Authenticates, requires server-resolved PRO, validates the Deal ID, then
 * loads an explicit paid DTO. Client plan claims are discarded.
 */
export async function fulfillProtectedDealRequest(
  input: ProtectedDealRequestInput,
): Promise<ProtectedDealResponse> {
  void input.clientClaimedPlan;

  const dealIdResult = uuidSchema.safeParse(input.dealId);
  if (!dealIdResult.success) {
    return {
      status: 400,
      body: {
        error: PROTECTED_DEAL_ERROR.INVALID_ID,
        code: "INVALID_DEAL_ID",
      },
    };
  }

  const userIdResult = uuidSchema.safeParse(input.userId);
  if (!userIdResult.success) {
    return {
      status: 401,
      body: {
        error: PROTECTED_DEAL_ERROR.UNAUTHENTICATED,
        code: "UNAUTHENTICATED",
      },
    };
  }

  if (!isProEntitlement(input.entitlement)) {
    return {
      status: 403,
      body: {
        error: PROTECTED_DEAL_ERROR.FORBIDDEN,
        code: "FORBIDDEN",
      },
    };
  }

  const access: ProCanonicalAccess = {
    kind: "pro",
    userId: userIdResult.data,
  };
  const dto = await input.loadPaidDeal(dealIdResult.data, access);
  if (!dto) {
    return {
      status: 404,
      body: {
        error: PROTECTED_DEAL_ERROR.NOT_FOUND,
        code: "NOT_FOUND",
      },
    };
  }

  return { status: 200, body: dto };
}
