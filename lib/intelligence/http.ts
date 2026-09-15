import "server-only";

import { NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import { DatabaseQueryError } from "@/lib/db/errors";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import {
  fulfillProtectedIntelligenceList,
  fulfillProtectedIntelligenceRequest,
} from "@/lib/intelligence/access";
import { clientKeyFromRequest, rateLimit } from "@/lib/security/rate-limit";
import { ValidationError } from "@/lib/validation";
import type { ProCanonicalAccess } from "@/lib/entitlements/types";

export async function intelligenceRecordResponse<T>(
  request: NextRequest,
  id: string,
  load: (recordId: string, access: ProCanonicalAccess) => Promise<T | null>,
) {
  const user = await getAuthUser();
  const limited = rateLimit(
    clientKeyFromRequest(
      request,
      user ? `protected-intel:${user.id}` : "protected-intel",
    ),
    30,
    60_000,
  );
  if (!limited.ok) {
    return Response.json(
      { error: "Too many intelligence requests. Try again shortly." },
      { status: 429 },
    );
  }

  try {
    const entitlement = user ? await getCurrentEntitlement(user.id) : null;
    const result = await fulfillProtectedIntelligenceRequest({
      userId: user?.id ?? null,
      id,
      entitlement,
      load,
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return intelligenceErrorResponse(error);
  }
}

export async function intelligenceListResponse<T>(
  request: NextRequest,
  load: (access: ProCanonicalAccess) => Promise<T>,
) {
  const user = await getAuthUser();
  const limited = rateLimit(
    clientKeyFromRequest(
      request,
      user ? `protected-intel-list:${user.id}` : "protected-intel-list",
    ),
    30,
    60_000,
  );
  if (!limited.ok) {
    return Response.json(
      { error: "Too many intelligence requests. Try again shortly." },
      { status: 429 },
    );
  }

  try {
    const entitlement = user ? await getCurrentEntitlement(user.id) : null;
    const result = await fulfillProtectedIntelligenceList({
      userId: user?.id ?? null,
      entitlement,
      load,
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return intelligenceErrorResponse(error);
  }
}

function intelligenceErrorResponse(error: unknown) {
  if (error instanceof ValidationError) {
    return Response.json(
      { error: "Invalid request.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }
  const message =
    error instanceof DatabaseQueryError
      ? "Paid intelligence is temporarily unavailable."
      : "Paid intelligence could not be loaded.";
  return Response.json({ error: message }, { status: 503 });
}
