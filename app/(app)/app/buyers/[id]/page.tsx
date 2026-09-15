import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BuyerProfile } from "@/components/intelligence/buyer-profile";
import { IntelligencePaywall } from "@/components/intelligence/paywall";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { parseOrganizationIdParam, appBuyerPath } from "@/lib/intelligence/paths";
import { readIntelligence, requireProIntelligence } from "@/lib/intelligence/page";
import { loadBuyerIntelligence } from "@/lib/intelligence/protected";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: parseOrganizationIdParam(id) ? "Buyer intelligence" : "Buyer not found",
    robots: { index: false, follow: false },
  } satisfies Metadata;
}

export default async function BuyerIntelligencePage({ params }: PageProps) {
  const { id } = await params;
  const organizationId = parseOrganizationIdParam(id);
  if (!organizationId) {
    notFound();
  }

  const returnTo = appBuyerPath(organizationId);
  const gate = await requireProIntelligence(returnTo);
  if (gate.kind === "paywall") {
    return (
      <IntelligencePaywall
        title="Buyer intelligence"
        description="Buyer identity, procurement history, awards, incumbents, and renewal signals stay locked until Pro is verified. This page does not load organisation names for free accounts."
        returnTo={returnTo}
      />
    );
  }

  const loaded = await readIntelligence(() =>
    loadBuyerIntelligence(organizationId, gate.access),
  );
  if (loaded.unavailable) {
    return (
      <Main>
        <EmptyState kind="paidDataUnavailable" />
      </Main>
    );
  }
  if (!loaded.data) {
    notFound();
  }

  return (
    <Main>
      <BuyerProfile intelligence={loaded.data} />
    </Main>
  );
}
