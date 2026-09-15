import "server-only";

import { enqueueAndProcessProfileMatches } from "@/lib/matching/queue";

export async function queueCompanyProfileMatches(companyProfileId: string): Promise<void> {
  try {
    await enqueueAndProcessProfileMatches(companyProfileId);
  } catch (error) {
    console.error("DealAtlas match recalculation failed", error);
  }
}
