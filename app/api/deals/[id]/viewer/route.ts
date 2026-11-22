import type { NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import { readFoundingPublicCount } from "@/lib/billing/founding-public";
import { paymentPendingFor } from "@/lib/billing/payment-pending";
import { buildDealViewerBody } from "@/lib/deals/viewer";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { featureLimit } from "@/lib/quotas";
import { loadDealSaveState } from "@/lib/saves/queries";
import {
  clientKeyFromRequest,
  retryAfterSeconds,
  sharedRateLimit,
  viewerApiRateLimit,
} from "@/lib/security/rate-limit";
import { getPublicDealPreviewPageBySlug } from "@/lib/search/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseInputSafe, slugSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE, ...headers },
  });
}

export async function GET(
  request: NextRequest,
  // The segment is named [id] to share /api/deals/[id]; for this route it carries the public slug.
  context: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimit = viewerApiRateLimit("deal-viewer");
    const limited = await sharedRateLimit(
      clientKeyFromRequest(request, rateLimit.bucket),
      rateLimit.limit,
      rateLimit.windowMs,
    );
    if (!limited.ok) {
      return json(
        { error: "Too many requests. Try again shortly." },
        429,
        { "Retry-After": String(retryAfterSeconds(limited)) },
      );
    }

    const { id: slug } = await context.params;
    const parsedSlug = parseInputSafe(slugSchema, slug);
    if (!parsedSlug.success) {
      return json({ error: "Not found." }, 404);
    }

    const user = await getAuthUser();
    if (!user) {
      return json({ error: "Sign in required." }, 401);
    }

    const client = await createSupabaseServerClient();
    const page = await getPublicDealPreviewPageBySlug(
      client,
      parsedSlug.data,
      { userId: user.id },
    );
    if (!page || !page.dealId) {
      return json({ error: "Not found." }, 404);
    }

    const entitlement = await getCurrentEntitlement(user.id);
    const isPro = isProEntitlement(entitlement);
    const saveState = await loadDealSaveState(
      client,
      user.id,
      page.dealId,
    );
    const upgraded = request.nextUrl.searchParams.get("upgraded") === "1";

    const body = buildDealViewerBody({
      isPro,
      dealId: page.dealId,
      saved: saveState.saved,
      used: saveState.used,
      limit: featureLimit(entitlement?.plan ?? "FREE", "savedDeals"),
      founding: isPro
        ? { offered: false, sold_out: true }
        : await readFoundingPublicCount(),
      paymentPending: paymentPendingFor({
        signedIn: true,
        upgraded,
        isPro,
      }),
      match: page.match,
    });

    return json(body);
  } catch (error) {
    console.error(
      "Deal viewer API failed",
      error instanceof Error ? error.name : "unknown error",
    );
    return json({ error: "Unavailable." }, 500);
  }
}
