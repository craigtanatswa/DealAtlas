import { NextRequest } from "next/server";

import { DatabaseQueryError } from "@/lib/db/errors";
import { searchPublicDealPreviewsFromParams } from "@/lib/search/public";
import { clientKeyFromRequest, rateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function searchParamsRecord(
  searchParams: URLSearchParams,
): Record<string, string | string[] | undefined> {
  const record: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of searchParams.entries()) {
    const existing = record[key];
    if (existing === undefined) {
      record[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      record[key] = [existing, value];
    }
  }
  return record;
}

export async function GET(request: NextRequest) {
  const limited = rateLimit(
    clientKeyFromRequest(request, "public-search"),
    60,
    60_000,
  );
  if (!limited.ok) {
    return Response.json(
      { error: "Too many search requests. Try again shortly." },
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
    const client = await createSupabaseServerClient();
    const { filters, result } = await searchPublicDealPreviewsFromParams(
      client,
      searchParamsRecord(request.nextUrl.searchParams),
    );

    return Response.json({
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      filters: {
        query: filters.query ?? null,
        category: filters.category ?? null,
        buyerSector: filters.buyerSector ?? null,
        region: filters.region ?? null,
        valueBand: filters.valueBand ?? null,
        deadlineBand: filters.deadlineBand ?? null,
        dealType: filters.dealType ?? null,
        status: filters.status ?? null,
      },
    });
  } catch (error) {
    const message =
      error instanceof DatabaseQueryError
        ? "Search is temporarily unavailable."
        : "Search could not be completed.";
    return Response.json({ error: message }, { status: 503 });
  }
}
