import { createClient } from "@supabase/supabase-js";

import type { PublicDatabase } from "@/lib/db/public-schema";
import { getPublicEnv } from "@/lib/env/public";

export function createSupabaseAnonymousClient() {
  const env = getPublicEnv();

  return createClient<PublicDatabase>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
