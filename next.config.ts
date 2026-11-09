import type { NextConfig } from "next";

import { rawCategoryAliases } from "./lib/categories/filter-map";
import { assertPublicEnvHasNoSecrets } from "./lib/env/shared";

assertPublicEnvHasNoSecrets();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Guides are read from content/guides at request time; ship the markdown with every server bundle.
  outputFileTracingIncludes: {
    "/**": ["./content/guides/**/*.md"],
  },
  experimental: {
    authInterrupts: true,
  },
  async redirects() {
    return rawCategoryAliases().map(({ fromSlug, toSlug }) => ({
      source: `/categories/${fromSlug}`,
      destination: `/categories/${toSlug}`,
      permanent: true,
    }));
  },
};

export default nextConfig;
