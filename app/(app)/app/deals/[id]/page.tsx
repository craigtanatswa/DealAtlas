import { notFound } from "next/navigation";

import { SaveDealButton } from "@/components/saves/save-deal-button";
import { ExportDealsButton } from "@/components/exports/export-deals-button";
import { DealPaidDetail } from "@/components/deals/deal-paid-detail";
import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { requireUser } from "@/lib/auth/session";
import { DatabaseQueryError } from "@/lib/db/errors";
import { appDealPath, parseDealIdParam } from "@/lib/deals/paths";
import { loadPaidDealDto } from "@/lib/deals/protected";
import { loadDealHistory } from "@/lib/intelligence/protected";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { loadExportUsageForMonth } from "@/lib/exports/usage";
import { featureLimit } from "@/lib/quotas";
import { loadDealSaveState } from "@/lib/saves/queries";
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
  const isPro = isProEntitlement(entitlement);
  const exportUsage = isPro
    ? await loadExportUsageForMonth(user.id)
    : { used: 0 };
  const client = await createSupabaseServerClient();
  const saveState = await loadDealSaveState(client, user.id, dealId);
  const saveControl = (
    <SaveDealButton
      dealId={dealId}
      saved={saveState.saved}
      used={saveState.used}
      limit={featureLimit(entitlement.plan, "savedDeals")}
      signedIn
    />
  );
  const exportControl = (
    <ExportDealsButton
      source="dealIds"
      dealIds={[dealId]}
      isPro={isPro}
      used={exportUsage.used}
      limit={featureLimit(entitlement.plan, "exportRowsPerMonth")}
    />
  );

  if (isPro) {
    let dto = null;
    let history = null;
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

    if (dto) {
      try {
        history = await loadDealHistory(dealId, {
          kind: "pro",
          userId: user.id,
        });
      } catch (error) {
        if (!(error instanceof DatabaseQueryError)) {
          throw error;
        }
      }
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
        <DealPaidDetail
          deal={dto}
          history={history}
          match={match}
          save={saveControl}
          exportCsv={exportControl}
        />
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
        save={saveControl}
        unlock={{
          mode: "free",
          returnTo: appDealPath(dealId),
          revealHref: appDealPath(dealId),
        }}
      />
    </Main>
  );
}
