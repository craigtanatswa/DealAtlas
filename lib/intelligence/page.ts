import "server-only";

import { requireUser } from "@/lib/auth/session";
import { DatabaseQueryError } from "@/lib/db/errors";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import type { CanonicalAccess } from "@/lib/db/canonical";

export async function requireProIntelligence(returnTo: string): Promise<
  | { kind: "paywall"; userId: string }
  | { kind: "pro"; userId: string; access: CanonicalAccess }
> {
  const { user } = await requireUser(returnTo);
  const entitlement = await getCurrentEntitlement(user.id);
  if (!isProEntitlement(entitlement)) {
    return { kind: "paywall", userId: user.id };
  }
  return {
    kind: "pro",
    userId: user.id,
    access: { kind: "pro", userId: user.id },
  };
}

export async function readIntelligence<T>(
  load: () => Promise<T>,
): Promise<{ data: T; unavailable: false } | { data: null; unavailable: true }> {
  try {
    return { data: await load(), unavailable: false };
  } catch (error) {
    if (!(error instanceof DatabaseQueryError)) {
      throw error;
    }
    return { data: null, unavailable: true };
  }
}

