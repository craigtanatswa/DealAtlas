import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { SaveDealButton } from "@/components/saves/save-deal-button";
import { UpgradeStatusBanner } from "@/components/billing/upgrade-status-banner";
import { DealBreadcrumbs } from "@/components/deals/deal-breadcrumbs";
import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { RelatedDeals } from "@/components/deals/related-deals";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { getAuthUser } from "@/lib/auth/session";
import { loginPathWithNext } from "@/lib/auth/redirect";
import { getAppOrigin } from "@/lib/auth/urls";
import { appDealPath } from "@/lib/deals/paths";
import { listRelatedDealPreviews } from "@/lib/deals/public-card-previews";
import type { PublicCardPreview } from "@/lib/deals/public-card-types";
import { readFoundingPublicCount } from "@/lib/billing/founding-public";
import { paymentPendingFor } from "@/lib/billing/payment-pending";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { featureLimit } from "@/lib/quotas";
import { loadDealSaveState } from "@/lib/saves/queries";
import { categoryLabel } from "@/lib/preview/display";
import { PUBLISHABLE_REGIONS } from "@/lib/preview/region";
import { publicDealPreviewMetadata, missingPublicDealPreviewMetadata } from "@/lib/search/metadata";
import { getPublicDealPreviewPageBySlug } from "@/lib/search/public";
import { categoryLandingForRawCategory } from "@/lib/seo/category-landings";
import { isIndexablePublicPreview } from "@/lib/seo/indexability";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { createSupabaseAnonymousClient } from "@/lib/supabase/anonymous";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseInputSafe, slugSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const loadPreviewPage = cache(async (slug: string) => {
  const parsed = parseInputSafe(slugSchema, slug);
  if (!parsed.success) {
    return null;
  }

  const user = await getAuthUser();
  const client = await createSupabaseServerClient();
  return getPublicDealPreviewPageBySlug(client, parsed.data, {
    userId: user?.id ?? null,
  });
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
    page.preview,
    `${origin}/deals/${page.preview.slug}`,
  );
}

export default async function DealPreviewPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const upgraded = (await searchParams).upgraded === "1";
  const page = await loadPreviewPage(slug);

  if (!page) {
    notFound();
  }

  const [user, foundingCount] = await Promise.all([
    getAuthUser(),
    readFoundingPublicCount(),
  ]);
  const entitlement = user ? await getCurrentEntitlement(user.id) : null;
  const mode = !user
    ? "anonymous"
    : isProEntitlement(entitlement)
      ? "pro"
      : "free";
  const dealId = user ? page.dealId : null;
  const saveState = user && dealId
    ? await loadDealSaveState(await createSupabaseServerClient(), user.id, dealId)
    : { saved: false, used: 0 };

  const founding = mode === "pro" ? null : foundingCount;
  const origin = getAppOrigin();
  const indexable = isIndexablePublicPreview(page.preview);

  let relatedDeals: PublicCardPreview[] = [];
  try {
    relatedDeals = await listRelatedDealPreviews(
      createSupabaseAnonymousClient(),
      {
        slug: page.preview.slug,
        mainCategory: page.preview.mainCategory,
        broadRegion: page.preview.broadRegion,
      },
    );
  } catch {
    relatedDeals = [];
  }

  const relatedHub = categoryLandingForRawCategory(page.preview.mainCategory);
  const relatedCategory =
    relatedHub?.name ?? categoryLabel(page.preview.mainCategory) ?? "similar";
  const sharedRegion =
    relatedDeals.length >= 3 &&
    page.preview.broadRegion !== null &&
    PUBLISHABLE_REGIONS.includes(page.preview.broadRegion) &&
    relatedDeals.every(
      (deal) => deal.broadRegion === page.preview.broadRegion,
    );
  const relatedHeading = `More ${relatedCategory} opportunities${
    sharedRegion ? ` in ${page.preview.broadRegion}` : ""
  }`;
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Deals", path: "/deals" },
    ...(relatedHub
      ? [{ name: relatedHub.name, path: relatedHub.path }]
      : []),
    {
      name: page.preview.previewTitle,
      path: `/deals/${page.preview.slug}`,
    },
  ];

  return (
    <Main back>
      {user && upgraded ? <UpgradeStatusBanner initialPro={mode === "pro"} /> : null}
      {indexable ? (
        <JsonLd
          data={[
            webPageJsonLd({
              origin,
              path: `/deals/${page.preview.slug}`,
              name: page.preview.previewTitle,
              description: page.preview.previewSummary,
            }),
            breadcrumbJsonLd(origin, crumbs),
          ]}
        />
      ) : null}
      <DealBreadcrumbs preview={page.preview} />
      <DealPreviewDetail
        deal={page.preview}
        match={page.match}
        save={
          <SaveDealButton
            dealId={dealId}
            saved={saveState.saved}
            used={saveState.used}
            limit={featureLimit(entitlement?.plan ?? "FREE", "savedDeals")}
            signedIn={Boolean(user)}
            loginHref={loginPathWithNext(`/deals/${page.preview.slug}`)}
          />
        }
        signedIn={Boolean(user)}
        unlock={{
          mode,
          loginHref: loginPathWithNext(`/deals/${page.preview.slug}`),
          revealHref: dealId ? appDealPath(dealId) : undefined,
          returnTo: dealId ? appDealPath(dealId) : undefined,
          founding: founding ?? undefined,
          paymentPending: paymentPendingFor({
            signedIn: Boolean(user),
            upgraded,
            isPro: mode === "pro",
          }),
        }}
      />
      <RelatedDeals
        deals={relatedDeals}
        heading={relatedHeading}
        hub={relatedHub ? { name: relatedHub.name, path: relatedHub.path } : null}
      />
    </Main>
  );
}
