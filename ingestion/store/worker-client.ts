import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prettifyError } from "zod";

import type { Database } from "@/lib/db/database.types";
import { getPublicEnv } from "@/lib/env/public";
import {
  SERVER_ENV_KEYS,
  serverEnvSchema,
} from "@/lib/env/server-schema";
import { formatEnvError, pickEnv } from "@/lib/env/shared";

export type IngestionSupabaseClient = SupabaseClient<Database>;

function ensureNodeWebSocket() {
  if (typeof globalThis.WebSocket !== "undefined") {
    return;
  }

  class IngestionNoopWebSocket {
    url = "";
    readyState = 3;
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return false;
    }
  }

  globalThis.WebSocket =
    IngestionNoopWebSocket as unknown as typeof WebSocket;
}

export function createIngestionSupabaseClient(
  env: Record<string, string | undefined> = process.env,
): IngestionSupabaseClient {
  ensureNodeWebSocket();
  const publicEnv = getPublicEnv(env);
  const parsed = serverEnvSchema.safeParse(pickEnv(env, SERVER_ENV_KEYS));
  if (!parsed.success) {
    throw formatEnvError("Server", prettifyError(parsed.error));
  }

  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    parsed.data.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
