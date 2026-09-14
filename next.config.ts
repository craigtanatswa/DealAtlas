import type { NextConfig } from "next";

import { assertPublicEnvHasNoSecrets } from "./lib/env/shared";

assertPublicEnvHasNoSecrets();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
