import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { SaveDealButton } from "@/components/saves/save-deal-button";
import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { getAuthUser } from "@/lib/auth/session";
import { loginPathWithNext } from "@/lib/auth/redirect";
import { getAppOrigin } from "@/lib/auth/urls";
import { appDealPath } from "@/lib/deals/paths";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { featureLimit } from "@/lib/quotas";
import { loadDealSaveState } from "@/lib/saves/queries";
import { publicDealPreviewMetadata, missingPublicDealPreviewMetadata } from "@/lib/search/metadata";
import { getPublicDealPreviewPageBySlug } from "@/lib/search/public";
import { isIndexablePublicPreview } from "@/lib/seo/indexability";
import { webPageJsonLd } from "@/lib/seo/json-ld";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseInputSafe, slugSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const loadPreviewPage = cache(async (slug: string) => {
  const parsed = parseInputSafe(slugSchema, slug);
  if (!parsed.success) {
    return null;
  }

  const user = await getAuthUser();
  const client = await createSupabaseServerClient();
  return getPublicDealPreviewPageBySlug(client, parsed.data, {
    signedIn: Boolean(user),
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

export default async function DealPreviewPage({ params }: PageProps) {
  const { slug } = await params;
  const page = await loadPreviewPage(slug);

  if (!page) {
    notFound();
  }

  const user = await getAuthUser();
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

  const origin = getAppOrigin();
  const indexable = isIndexablePublicPreview(page.preview);

  return (
    <Main>
      {indexable ? (
        <JsonLd
          data={webPageJsonLd({
            origin,
            path: `/deals/${page.preview.slug}`,
            name: page.preview.previewTitle,
            description: page.preview.previewSummary,
          })}
        />
      ) : null}
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
        unlock={{
          mode,
          loginHref: loginPathWithNext(`/deals/${page.preview.slug}`),
          revealHref: dealId ? appDealPath(dealId) : undefined,
          returnTo: dealId ? appDealPath(dealId) : undefined,
        }}
      />
    </Main>
  );
}
