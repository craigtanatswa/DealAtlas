import { uuidSchema } from "@/lib/validation";
import { isProEntitlement } from "@/lib/entitlements/policy";
import type {
  EntitlementSnapshot,
  ProCanonicalAccess,
} from "@/lib/entitlements/types";

export const PROTECTED_INTELLIGENCE_ERROR = {
  UNAUTHENTICATED: "Authentication required to access paid intelligence.",
  FORBIDDEN:
    "Buyer, supplier, and contract intelligence is not available without a verified Pro subscription.",
  INVALID_ID: "Invalid identifier.",
  NOT_FOUND: "Record not found.",
} as const;

export type IntelligenceLoad<T> = (
  id: string,
  access: ProCanonicalAccess,
) => Promise<T | null>;

export type ProtectedIntelligenceRequestInput<T> = {
  userId: string | null;
  id: unknown;
  entitlement: EntitlementSnapshot | null;
  clientClaimedPlan?: unknown;
  load: IntelligenceLoad<T>;
};

export type ProtectedIntelligenceListInput<T> = {
  userId: string | null;
  entitlement: EntitlementSnapshot | null;
  clientClaimedPlan?: unknown;
  load: (access: ProCanonicalAccess) => Promise<T>;
};

export type ProtectedIntelligenceResponse<T> =
  | { status: 200; body: T }
  | { status: 400 | 401 | 403 | 404; body: { error: string; code: string } };

function denyUnauthenticated<T>(): ProtectedIntelligenceResponse<T> {
  return {
    status: 401,
    body: {
      error: PROTECTED_INTELLIGENCE_ERROR.UNAUTHENTICATED,
      code: "UNAUTHENTICATED",
    },
  };
}

function denyForbidden<T>(): ProtectedIntelligenceResponse<T> {
  return {
    status: 403,
    body: {
      error: PROTECTED_INTELLIGENCE_ERROR.FORBIDDEN,
      code: "FORBIDDEN",
    },
  };
}

/**
 * Paid organisation/contract gate. Client plan labels are ignored. Canonical
 * loaders run only after server-resolved Pro.
 */
export async function fulfillProtectedIntelligenceRequest<T>(
  input: ProtectedIntelligenceRequestInput<T>,
): Promise<ProtectedIntelligenceResponse<T>> {
  void input.clientClaimedPlan;

  const idResult = uuidSchema.safeParse(input.id);
  if (!idResult.success) {
    return {
      status: 400,
      body: {
        error: PROTECTED_INTELLIGENCE_ERROR.INVALID_ID,
        code: "INVALID_ID",
      },
    };
  }

  const userIdResult = uuidSchema.safeParse(input.userId);
  if (!userIdResult.success) {
    return denyUnauthenticated();
  }

  if (!isProEntitlement(input.entitlement)) {
    return denyForbidden();
  }

  const access: ProCanonicalAccess = {
    kind: "pro",
    userId: userIdResult.data,
  };
  const dto = await input.load(idResult.data, access);
  if (!dto) {
    return {
      status: 404,
      body: {
        error: PROTECTED_INTELLIGENCE_ERROR.NOT_FOUND,
        code: "NOT_FOUND",
      },
    };
  }

  return { status: 200, body: dto };
}

export async function fulfillProtectedIntelligenceList<T>(
  input: ProtectedIntelligenceListInput<T>,
): Promise<ProtectedIntelligenceResponse<T>> {
  void input.clientClaimedPlan;

  const userIdResult = uuidSchema.safeParse(input.userId);
  if (!userIdResult.success) {
    return denyUnauthenticated();
  }

  if (!isProEntitlement(input.entitlement)) {
    return denyForbidden();
  }

  const body = await input.load({
    kind: "pro",
    userId: userIdResult.data,
  });
  return { status: 200, body };
}
