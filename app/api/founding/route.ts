import { foundingAvailabilityPayload } from "@/lib/billing/founding";
import { readFoundingRemaining } from "@/lib/billing/founding-db";

export async function GET() {
  const remaining = await readFoundingRemaining();
  return Response.json(foundingAvailabilityPayload(remaining), {
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=30",
    },
  });
}
