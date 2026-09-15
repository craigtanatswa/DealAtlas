import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { SaveDealButton } from "@/components/saves/save-deal-button";
import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { Main } from "@/components/layout/container";
import { getAuthUser } from "@/lib/auth/session";
import { loginPathWithNext } from "@/lib/auth/redirect";
import { appDealPath } from "@/lib/deals/paths";
import { getPublicEnv } from "@/lib/env/public";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { featureLimit } from "@/lib/quotas";
import { loadDealSaveState } from "@/lib/saves/queries";
import { publicDealPreviewMetadata } from "@/lib/search/metadata";
import { getPublicDealPreviewPageBySlug } from "@/lib/search/public";
import { loadMatchForPreviewPage } from "@/lib/matching/search";
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

  const client = await createSupabaseServerClient();
  return getPublicDealPreviewPageBySlug(client, parsed.data);
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPreviewPage(slug);

  if (!page) {
    return {
      title: "Opportunity not found",
      robots: { index: false, follow: false },
    };
  }

  const origin = getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
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
  const client = await createSupabaseServerClient();
  const match = await loadMatchForPreviewPage({
    client,
    userId: user?.id ?? null,
    dealId: page.dealId,
  });
  const saveState = user
    ? await loadDealSaveState(client, user.id, page.dealId)
    : { saved: false, used: 0 };

  return (
    <Main>
      <DealPreviewDetail
        deal={page.preview}
        match={match}
        save={
          <SaveDealButton
            dealId={page.dealId}
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
          revealHref: appDealPath(page.dealId),
          returnTo: appDealPath(page.dealId),
        }}
      />
    </Main>
  );
}
