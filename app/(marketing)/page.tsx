import type { Metadata } from "next";

import {
  HomeHero,
  HomeOpportunitySections,
  HomeTestimonialsSection,
  HomeValueSections,
} from "@/components/marketing/home-sections";
import { RecentAwardStripView } from "@/components/marketing/recent-award-strip";
import { Container } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { getAuthUser } from "@/lib/auth/session";
import { getAppOrigin } from "@/lib/auth/urls";
import { loadRecentAwardStrip } from "@/lib/awards/load";
import { searchDealPreviewsForUser, searchHomeLatestDealPreviews } from "@/lib/matching/search";
import { organizationJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { PUBLIC_PAGE_COPY } from "@/lib/seo/pages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const origin = getAppOrigin();

export const metadata: Metadata = marketingPageMetadata({
  title: PUBLIC_PAGE_COPY.home.title,
  description: PUBLIC_PAGE_COPY.home.description,
  path: PUBLIC_PAGE_COPY.home.path,
  origin,
  absoluteTitle: true,
});

export default async function HomePage() {
  const client = await createSupabaseServerClient();
  const user = await getAuthUser();
  const [latest, closingSoon, awards] = await Promise.all([
    searchHomeLatestDealPreviews({ client, userId: user?.id }),
    searchDealPreviewsForUser({
      client,
      searchParams: { status: "CLOSING_SOON", limit: "4" },
      userId: user?.id,
      defaultSort: "updated",
    }),
    loadRecentAwardStrip(client),
  ]);

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
      <HomeHero />
      <Container className="flex flex-col gap-16 py-12 md:py-16">
        <HomeOpportunitySections
          latest={latest.result}
          closingSoon={closingSoon.result}
        />
      </Container>
      <RecentAwardStripView strip={awards} nextPath="/" />
      <HomeTestimonialsSection />
      <Container className="flex flex-col gap-16 py-12 md:py-16">
        <HomeValueSections />
      </Container>
    </main>
  );
}
