import { NextRequest } from "next/server";

import { intelligenceRecordResponse } from "@/lib/intelligence/http";
import { loadBuyerIntelligence } from "@/lib/intelligence/protected";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return intelligenceRecordResponse(request, id, loadBuyerIntelligence);
}
