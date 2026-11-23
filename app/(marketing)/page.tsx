import type { Metadata } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

import {
  HOME_GUIDES_LIMIT,
  HomeGuidesSection,
  HomeHero,
  HomeLiveOpportunities,
  HomeTestimonialsSection,
  HomeValueSections,
} from "@/components/marketing/home-sections";
import { HomeFoundingCta } from "@/components/marketing/home-founding-cta";
import { Container } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { getAppOrigin } from "@/lib/auth/urls";
import { foundingUiState } from "@/lib/billing/founding-ui";
import { readFoundingPublicCount } from "@/lib/billing/founding-public";
import { listPublishedGuides } from "@/lib/guides/content";
import { getHomeSearchChips } from "@/lib/search/home-chips-server";
import { getCachedHomeLivePreviews } from "@/lib/search/public-cached";
import { organizationJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { PUBLIC_PAGE_COPY } from "@/lib/seo/pages";

export const dynamic = "error";
export const revalidate = 300;

const origin = getAppOrigin();

export const metadata: Metadata = marketingPageMetadata({
  title: PUBLIC_PAGE_COPY.home.title,
  description: PUBLIC_PAGE_COPY.home.description,
  path: PUBLIC_PAGE_COPY.home.path,
  origin,
  absoluteTitle: true,
});

export default async function HomePage() {
  const [founding, searchChips, live] = await Promise.all([
    readFoundingPublicCount(),
    // Cached ~1h; on failure show no "Try" chips rather than possibly empty ones.
    getHomeSearchChips().catch(() => []),
    // Build-time prerender only (CI has no database): render an empty list and let the
    // first request after deploy regenerate. At runtime a failure throws, so ISR keeps
    // serving the last good page instead of caching an empty one.
    getCachedHomeLivePreviews().catch((error: unknown) => {
      if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) throw error;
      console.warn("Home live previews unavailable at build; prerendering an empty list.");
      return { items: [], total: 0, page: 1, pageSize: 0 };
    }),
  ]);
  const foundingState = foundingUiState(founding);

  return (
    <main id="main-content" className="flex flex-1 flex-col">
      <JsonLd
        data={[
          organizationJsonLd(origin),
          webPageJsonLd({
            origin,
            path: "/",
            name: PUBLIC_PAGE_COPY.home.title,
            description: PUBLIC_PAGE_COPY.home.description,
          }),
        ]}
      />
      <HomeHero signedIn="viewer" searchChips={searchChips} />
      <HomeLiveOpportunities
        items={live.items}
        total={live.total}
        signedIn="viewer"
      />
      <HomeGuidesSection guides={listPublishedGuides().slice(0, HOME_GUIDES_LIMIT)} />
      {foundingState === "available" ? (
        <HomeFoundingCta signedIn="viewer" founding={founding} />
      ) : null}
      <HomeTestimonialsSection />
      <Container className="flex flex-col gap-16 py-12 md:py-16">
        <HomeValueSections />
      </Container>
    </main>
  );
}
