import type { PublicEnv } from "@/lib/env/public-schema";

export type MeasurementConfig = {
  googleSiteVerification?: string;
  gaMeasurementId?: string;
  gtmId?: string;
};

/**
 * Public measurement hooks. IDs are optional placeholders until Search Console
 * and analytics properties are created. Do not put buyer names, source titles,
 * source URLs, or notice identifiers on these events — use path or preview slug.
 */
export function getMeasurementConfig(
  env: Pick<
    PublicEnv,
    | "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION"
    | "NEXT_PUBLIC_GA_MEASUREMENT_ID"
    | "NEXT_PUBLIC_GTM_ID"
  >,
): MeasurementConfig {
  return {
    googleSiteVerification: env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    gaMeasurementId: env.NEXT_PUBLIC_GTM_ID
      ? undefined
      : env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    gtmId: env.NEXT_PUBLIC_GTM_ID,
  };
}

export function publicAnalyticsContext(input: {
  path?: unknown;
  previewSlug?: unknown;
  sourceUrl?: unknown;
  buyerName?: unknown;
  sourceTitle?: unknown;
}): { path?: string; previewSlug?: string } {
  void input.sourceUrl;
  void input.buyerName;
  void input.sourceTitle;
  return {
    path: typeof input.path === "string" ? input.path : undefined,
    previewSlug:
      typeof input.previewSlug === "string" ? input.previewSlug : undefined,
  };
}
