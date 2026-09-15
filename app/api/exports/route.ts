import { NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import { DatabaseQueryError } from "@/lib/db/errors";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { fulfillDealExportRequest } from "@/lib/exports/access";
import { EXPORT_ERROR } from "@/lib/exports/errors";
import { contentDisposition } from "@/lib/exports/filename";
import { loadPaidDealsForExport } from "@/lib/exports/load";
import { resolveExportDealIds } from "@/lib/exports/select";
import { loadExportUsageForMonth, recordExportUsage } from "@/lib/exports/usage";
import { clientKeyFromRequest, rateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  const limited = rateLimit(
    clientKeyFromRequest(request, user ? `export:${user.id}` : "export"),
    30,
    60_000,
  );
  if (!limited.ok) {
    return Response.json(
      { error: "Too many export requests. Try again shortly." },
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

  if (!user) {
    return Response.json(
      { error: "Sign in to export opportunities.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const entitlement = await getCurrentEntitlement(user.id);
  if (!isProEntitlement(entitlement)) {
    return Response.json(
      { error: EXPORT_ERROR.FORBIDDEN, code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const usage = await loadExportUsageForMonth(user.id);
    return Response.json({
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
      billingMonth: usage.billingMonth,
    });
  } catch (error) {
    const message =
      error instanceof DatabaseQueryError
        ? "Export usage is temporarily unavailable."
        : "Export usage could not be loaded.";
    return Response.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  const limited = rateLimit(
    clientKeyFromRequest(request, user ? `export:${user.id}` : "export"),
    10,
    60_000,
  );
  if (!limited.ok) {
    return Response.json(
      { error: "Too many export requests. Try again shortly." },
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Choose a filtered result set or selected deals to export.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  try {
    const entitlement = user ? await getCurrentEntitlement(user.id) : null;
    const usage = user && isProEntitlement(entitlement)
      ? await loadExportUsageForMonth(user.id)
      : { remaining: 0 };
    const client = await createSupabaseServerClient();
    const result = await fulfillDealExportRequest({
      userId: user?.id ?? null,
      entitlement,
      remaining: usage.remaining,
      body,
      resolveDealIds: ({ userId, body: parsed, remaining }) =>
        resolveExportDealIds({ client, userId, body: parsed, remaining }),
      loadPaidDeals: loadPaidDealsForExport,
      recordUsage: ({ userId, rowCount }) => recordExportUsage({ userId, rowCount }),
    });

    if (result.status !== 200) {
      return Response.json(result.body, { status: result.status });
    }

    return new Response(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(result.filename),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Export-Row-Count": String(result.rowCount),
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json(
        { error: "Invalid export request.", code: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const message =
      error instanceof DatabaseQueryError
        ? "Export is temporarily unavailable."
        : "Opportunities could not be exported.";
    return Response.json({ error: message }, { status: 503 });
  }
}
