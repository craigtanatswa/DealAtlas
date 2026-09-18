import { prettifyError } from "zod";

import { productionPublicUrlError } from "@/lib/env/production";
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

function publicEnvFromProcess(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

export function getPublicEnv(
  env: Record<string, string | undefined> = process.env,
): PublicEnv {
  const fromProcess = env === process.env;
  if (fromProcess && cached) {
    return cached;
  }

  assertPublicEnvHasNoSecrets(env);

  const source = fromProcess ? publicEnvFromProcess() : env;
  const parsed = publicEnvSchema.safeParse(pickEnv(source, PUBLIC_ENV_KEYS));

  if (!parsed.success) {
    throw formatEnvError("Public", prettifyError(parsed.error));
  }

  const productionUrlError = productionPublicUrlError(source);
  if (productionUrlError) {
    throw formatEnvError("Public", productionUrlError);
  }

  if (fromProcess) {
    cached = parsed.data;
  }

  return parsed.data;
}
