import { z } from "zod";

export const dodoEnvironmentSchema = z.enum(["test_mode", "live_mode"]);

export const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  DODO_PAYMENTS_API_KEY: z.string().min(1).optional(),
  DODO_PAYMENTS_WEBHOOK_KEY: z.string().min(1).optional(),
  DODO_PAYMENTS_ENVIRONMENT: dodoEnvironmentSchema.default("test_mode"),
  DODO_PAYMENTS_RETURN_URL: z.url().optional(),
  DODO_PRO_MONTHLY_PRODUCT_ID: z.string().min(1).optional(),
  DODO_PRO_ANNUAL_PRODUCT_ID: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  DEALATLAS_EMAIL_FROM: z.string().min(1).optional(),
  SENTRY_DSN: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const SERVER_ENV_KEYS = [
  "SUPABASE_SECRET_KEY",
  "DODO_PAYMENTS_API_KEY",
  "DODO_PAYMENTS_WEBHOOK_KEY",
  "DODO_PAYMENTS_ENVIRONMENT",
  "DODO_PAYMENTS_RETURN_URL",
  "DODO_PRO_MONTHLY_PRODUCT_ID",
  "DODO_PRO_ANNUAL_PRODUCT_ID",
  "RESEND_API_KEY",
  "DEALATLAS_EMAIL_FROM",
  "SENTRY_DSN",
] as const satisfies ReadonlyArray<keyof ServerEnv>;
