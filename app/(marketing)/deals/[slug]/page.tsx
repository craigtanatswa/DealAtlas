import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { DealBreadcrumbs } from "@/components/deals/deal-breadcrumbs";
import { DealViewerIsland } from "@/components/deals/deal-viewer-island";
import { RelatedDeals } from "@/components/deals/related-deals";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { loginPathWithNext } from "@/lib/auth/redirect";
import { getAppOrigin } from "@/lib/auth/urls";
import { listRelatedDealPreviews } from "@/lib/deals/public-card-previews";
import type { PublicCardPreview } from "@/lib/deals/public-card-types";
import { readFoundingPublicCount } from "@/lib/billing/founding-public";
import { categoryLabel } from "@/lib/preview/display";
import { PUBLISHABLE_REGIONS } from "@/lib/preview/region";
import { publicDealPreviewMetadata, missingPublicDealPreviewMetadata } from "@/lib/search/metadata";
import { getCachedPublicDealPreview } from "@/lib/search/public-cached";
import { categoryLandingForRawCategory } from "@/lib/seo/category-landings";
import { isIndexablePublicPreview } from "@/lib/seo/indexability";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { createSupabaseAnonymousClient } from "@/lib/supabase/anonymous";
import { parseInputSafe, slugSchema } from "@/lib/validation";

export const dynamic = "error";
export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

const loadPreviewPage = cache(async (slug: string) => {
  const parsed = parseInputSafe(slugSchema, slug);
  if (!parsed.success) {
    return null;
  }

  return getCachedPublicDealPreview(parsed.data);
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPreviewPage(slug);

  if (!page) {
    return missingPublicDealPreviewMetadata();
  }

  const origin = getAppOrigin();
  return publicDealPreviewMetadata(
    page,
    `${origin}/deals/${page.slug}`,
  );
}

export default async function DealPreviewPage({ params }: PageProps) {
  const { slug } = await params;
  const [page, foundingCount] = await Promise.all([
    loadPreviewPage(slug),
    readFoundingPublicCount(),
  ]);

  if (!page) {
    notFound();
  }

  const origin = getAppOrigin();
  const indexable = isIndexablePublicPreview(page);

  let relatedDeals: PublicCardPreview[] = [];
  try {
    relatedDeals = await listRelatedDealPreviews(
      createSupabaseAnonymousClient(),
      {
        slug: page.slug,
        mainCategory: page.mainCategory,
        broadRegion: page.broadRegion,
      },
    );
  } catch {
    relatedDeals = [];
  }

  const relatedHub = categoryLandingForRawCategory(page.mainCategory);
  const relatedCategory =
    relatedHub?.name ?? categoryLabel(page.mainCategory) ?? "similar";
  const sharedRegion =
    relatedDeals.length >= 3 &&
    page.broadRegion !== null &&
    PUBLISHABLE_REGIONS.includes(page.broadRegion) &&
    relatedDeals.every(
      (deal) => deal.broadRegion === page.broadRegion,
    );
  const relatedHeading = `More ${relatedCategory} opportunities${
    sharedRegion ? ` in ${page.broadRegion}` : ""
  }`;
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Deals", path: "/deals" },
    ...(relatedHub
      ? [{ name: relatedHub.name, path: relatedHub.path }]
      : []),
    {
      name: page.previewTitle,
      path: `/deals/${page.slug}`,
    },
  ];

  return (
    <Main back>
      {indexable ? (
        <JsonLd
          data={[
            webPageJsonLd({
              origin,
              path: `/deals/${page.slug}`,
              name: page.previewTitle,
              description: page.previewSummary,
            }),
            breadcrumbJsonLd(origin, crumbs),
          ]}
        />
      ) : null}
      <DealBreadcrumbs preview={page} />
      <DealViewerIsland
        slug={page.slug}
        deal={page}
        loginHref={loginPathWithNext(`/deals/${page.slug}`)}
        founding={foundingCount}
      />
      <RelatedDeals
        deals={relatedDeals}
        heading={relatedHeading}
        hub={relatedHub ? { name: relatedHub.name, path: relatedHub.path } : null}
      />
    </Main>
  );
}
