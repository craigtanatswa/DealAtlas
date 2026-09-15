import { NextRequest } from "next/server";

import { intelligenceListResponse } from "@/lib/intelligence/http";
import { listBuyerDirectory } from "@/lib/intelligence/protected";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const query = url.searchParams.get("q") ?? "";
  const page = Number(url.searchParams.get("page") ?? "1");
  return intelligenceListResponse(request, (access) =>
    listBuyerDirectory(access, {
      query,
      page: Number.isFinite(page) ? page : 1,
    }),
  );
}
