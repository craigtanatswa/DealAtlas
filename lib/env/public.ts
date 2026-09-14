import { prettifyError } from "zod";

import {
  PUBLIC_ENV_KEYS,
  publicEnvSchema,
  type PublicEnv,
} from "@/lib/env/public-schema";
import {
  assertPublicEnvHasNoSecrets,
  formatEnvError,
  pickEnv,
} from "@/lib/env/shared";

export type { PublicEnv };

let cached: PublicEnv | undefined;

export function getPublicEnv(
  env: Record<string, string | undefined> = process.env,
): PublicEnv {
  if (env === process.env && cached) {
    return cached;
  }

  assertPublicEnvHasNoSecrets(env);

  const parsed = publicEnvSchema.safeParse(pickEnv(env, PUBLIC_ENV_KEYS));

  if (!parsed.success) {
    throw formatEnvError("Public", prettifyError(parsed.error));
  }

  if (env === process.env) {
    cached = parsed.data;
  }

  return parsed.data;
}
