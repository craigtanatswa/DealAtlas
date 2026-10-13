import type { Metadata } from "next";

import {
  HomeHero,
  HomeLiveOpportunities,
  HomeTestimonialsSection,
  HomeValueSections,
} from "@/components/marketing/home-sections";
import { Container } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { getAuthUser } from "@/lib/auth/session";
import { getAppOrigin } from "@/lib/auth/urls";
import { searchLiveHomePreviews } from "@/lib/search/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { organizationJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { PUBLIC_PAGE_COPY } from "@/lib/seo/pages";

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
  const user = await getAuthUser();
  const client = await createSupabaseServerClient();
  const live = await searchLiveHomePreviews(client);

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
      <HomeLiveOpportunities
        items={live.items}
        total={live.total}
        signedIn={Boolean(user)}
      />
      <HomeTestimonialsSection />
      <Container className="flex flex-col gap-16 py-12 md:py-16">
        <HomeValueSections />
      </Container>
    </main>
  );
}
