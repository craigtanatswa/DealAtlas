import { z } from "zod";

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().trim().min(1).optional(),
  NEXT_PUBLIC_GA_MEASUREMENT_ID: z
    .string()
    .trim()
    .regex(/^G-[A-Z0-9]+$/, "Expected a GA4 ID such as G-XXXXXXXX")
    .optional(),
  NEXT_PUBLIC_GTM_ID: z
    .string()
    .trim()
    .regex(/^GTM-[A-Z0-9]+$/, "Expected a GTM ID such as GTM-XXXXXXX")
    .optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION",
  "NEXT_PUBLIC_GA_MEASUREMENT_ID",
  "NEXT_PUBLIC_GTM_ID",
] as const satisfies ReadonlyArray<keyof PublicEnv>;
