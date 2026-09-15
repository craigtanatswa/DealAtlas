import { NextRequest } from "next/server";

import { intelligenceListResponse } from "@/lib/intelligence/http";
import { listRenewalIntelligence } from "@/lib/intelligence/protected";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  return intelligenceListResponse(request, (access) =>
    listRenewalIntelligence(access, {
      page: Number.isFinite(page) ? page : 1,
    }),
  );
}
