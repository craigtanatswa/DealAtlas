import { notFound } from "next/navigation";

import { DealPaidDetail } from "@/components/deals/deal-paid-detail";
import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { requireUser } from "@/lib/auth/session";
import { DatabaseQueryError } from "@/lib/db/errors";
import { appDealPath, parseDealIdParam } from "@/lib/deals/paths";
import { loadPaidDealDto } from "@/lib/deals/protected";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { loadCompanyProfileIdForUser, loadProMatchForDeal } from "@/lib/matching/load";
import { loadMatchForPreviewPage } from "@/lib/matching/search";
import { getPublicDealPreviewPageByDealId } from "@/lib/search/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: parseDealIdParam(id) ? "Deal" : "Deal not found",
    robots: { index: false, follow: false },
  };
}

export default async function AppDealPage({ params }: PageProps) {
  const { id } = await params;
  const dealId = parseDealIdParam(id);
  if (!dealId) {
    notFound();
  }

  const { user } = await requireUser(appDealPath(dealId));
  const entitlement = await getCurrentEntitlement(user.id);
  const client = await createSupabaseServerClient();

  if (isProEntitlement(entitlement)) {
    let dto = null;
    let paidDataUnavailable = false;
    try {
      dto = await loadPaidDealDto(dealId, {
        kind: "pro",
        userId: user.id,
      });
    } catch (error) {
      if (!(error instanceof DatabaseQueryError)) {
        throw error;
      }
      paidDataUnavailable = true;
    }

    if (paidDataUnavailable) {
      return (
        <Main>
          <EmptyState kind="paidDataUnavailable" />
        </Main>
      );
    }

    if (!dto) {
      notFound();
    }

    const companyProfileId = await loadCompanyProfileIdForUser(client, user.id);
    const match = companyProfileId
      ? await loadProMatchForDeal({ companyProfileId, dealId })
      : null;

    return (
      <Main>
        <DealPaidDetail deal={dto} match={match} />
      </Main>
    );
  }

  const previewPage = await getPublicDealPreviewPageByDealId(client, dealId);
  if (!previewPage) {
    notFound();
  }

  const match = await loadMatchForPreviewPage({
    client,
    userId: user.id,
    dealId,
  });

  return (
    <Main>
      <DealPreviewDetail
        deal={previewPage.preview}
        match={match}
        unlock={{
          mode: "free",
          returnTo: appDealPath(dealId),
          revealHref: appDealPath(dealId),
        }}
      />
    </Main>
  );
}
