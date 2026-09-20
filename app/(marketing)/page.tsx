import type { Metadata } from "next";

import {
  HomeHero,
  HomeOpportunitySections,
  HomeTestimonialsSection,
  HomeValueSections,
} from "@/components/marketing/home-sections";
import { Container } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { getAuthUser } from "@/lib/auth/session";
import { getAppOrigin } from "@/lib/auth/urls";
import { DatabaseQueryError } from "@/lib/db/errors";
import {
  searchDealPreviewsForUser,
  searchHomeLatestDealPreviews,
} from "@/lib/matching/search";
import { organizationJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { PUBLIC_PAGE_COPY } from "@/lib/seo/pages";
import type { RankedDealSearchResult } from "@/lib/search/dto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const origin = getAppOrigin();

const EMPTY_RESULT: RankedDealSearchResult = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 8,
};

export const metadata: Metadata = marketingPageMetadata({
  title: PUBLIC_PAGE_COPY.home.title,
  description: PUBLIC_PAGE_COPY.home.description,
  path: PUBLIC_PAGE_COPY.home.path,
  origin,
  absoluteTitle: true,
});

async function loadHomeOpportunities() {
  try {
    const client = await createSupabaseServerClient();
    const user = await getAuthUser();
    const [latest, closingSoon] = await Promise.all([
      searchHomeLatestDealPreviews({
        client,
        userId: user?.id,
      }),
      searchDealPreviewsForUser({
        client,
        searchParams: { status: "CLOSING_SOON", limit: "6" },
        userId: user?.id,
        defaultSort: "updated",
      }),
    ]);
    return {
      latest: latest.result,
      closingSoon: closingSoon.result,
    };
  } catch (error) {
    if (error instanceof DatabaseQueryError) {
      return { latest: EMPTY_RESULT, closingSoon: EMPTY_RESULT };
    }
    throw error;
  }
}

export default async function HomePage() {
  const { latest, closingSoon } = await loadHomeOpportunities();

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
        <HomeOpportunitySections latest={latest} closingSoon={closingSoon} />
      </Container>
      <HomeTestimonialsSection />
      <Container className="flex flex-col gap-16 py-12 md:py-16">
        <HomeValueSections />
      </Container>
    </main>
  );
}
