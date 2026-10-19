import type { NextConfig } from "next";

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
};

export default nextConfig;
