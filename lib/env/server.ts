import "server-only";

import { prettifyError } from "zod";

import {
  SERVER_ENV_KEYS,
  serverEnvSchema,
  type ServerEnv,
} from "@/lib/env/server-schema";
import { formatEnvError, pickEnv } from "@/lib/env/shared";

export type { ServerEnv };

let cached: ServerEnv | undefined;

export function getServerEnv(
  env: Record<string, string | undefined> = process.env,
): ServerEnv {
  if (env === process.env && cached) {
    return cached;
  }

  const parsed = serverEnvSchema.safeParse(pickEnv(env, SERVER_ENV_KEYS));

  if (!parsed.success) {
    throw formatEnvError("Server", prettifyError(parsed.error));
  }

  if (env === process.env) {
    cached = parsed.data;
  }

  return parsed.data;
}
