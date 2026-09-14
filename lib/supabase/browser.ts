"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { PublicDatabase } from "@/lib/db/public-schema";
import { getPublicEnv } from "@/lib/env/public";

export function createSupabaseBrowserClient() {
  const env = getPublicEnv();

  return createBrowserClient<PublicDatabase>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
