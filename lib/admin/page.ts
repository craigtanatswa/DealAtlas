import "server-only";

import { requireAdmin } from "@/lib/auth/session";
import { DatabaseQueryError } from "@/lib/db/errors";

export async function readAdmin<T>(
  load: () => Promise<T>,
): Promise<{ data: T; unavailable: false } | { data: null; unavailable: true }> {
  await requireAdmin("/admin");
  try {
    return { data: await load(), unavailable: false };
  } catch (error) {
    if (!(error instanceof DatabaseQueryError)) {
      throw error;
    }
    return { data: null, unavailable: true };
  }
}
