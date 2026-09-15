import type { MetadataRoute } from "next";

import { getAppOrigin } from "@/lib/auth/urls";
import { buildRobotsPolicy } from "@/lib/seo/sitemap";

export default function robots(): MetadataRoute.Robots {
  return buildRobotsPolicy(getAppOrigin());
}
