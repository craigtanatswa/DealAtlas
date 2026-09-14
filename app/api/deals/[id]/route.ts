import { NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import { fulfillProtectedDealRequest } from "@/lib/deals/protected-access";
import { loadPaidDealDto } from "@/lib/deals/protected";
import { DatabaseQueryError } from "@/lib/db/errors";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { clientKeyFromRequest, rateLimit } from "@/lib/security/rate-limit";
import { ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getAuthUser();
  const limited = rateLimit(
    clientKeyFromRequest(
      request,
      user ? `protected-deal:${user.id}` : "protected-deal",
    ),
    30,
    60_000,
  );
  if (!limited.ok) {
    return Response.json(
      { error: "Too many protected deal requests. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((limited.resetAt - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  try {
    const entitlement = user ? await getCurrentEntitlement(user.id) : null;
    const result = await fulfillProtectedDealRequest({
      userId: user?.id ?? null,
      dealId: id,
      entitlement,
      loadPaidDeal: loadPaidDealDto,
    });

    return Response.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json(
        { error: "Invalid request.", code: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const message =
      error instanceof DatabaseQueryError
        ? "Protected deal data is temporarily unavailable."
        : "Protected deal data could not be loaded.";
    return Response.json({ error: message }, { status: 503 });
  }
}
