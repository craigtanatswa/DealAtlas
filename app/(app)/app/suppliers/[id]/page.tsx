import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IntelligencePaywall } from "@/components/intelligence/paywall";
import { SupplierProfile } from "@/components/intelligence/supplier-profile";
import { EmptyState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { parseOrganizationIdParam, appSupplierPath } from "@/lib/intelligence/paths";
import { readIntelligence, requireProIntelligence } from "@/lib/intelligence/page";
import { loadSupplierIntelligence } from "@/lib/intelligence/protected";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: parseOrganizationIdParam(id) ? "Supplier intelligence" : "Supplier not found",
    robots: { index: false, follow: false },
  } satisfies Metadata;
}

export default async function SupplierIntelligencePage({ params }: PageProps) {
  const { id } = await params;
  const organizationId = parseOrganizationIdParam(id);
  if (!organizationId) {
    notFound();
  }

  const returnTo = appSupplierPath(organizationId);
  const gate = await requireProIntelligence(returnTo);
  if (gate.kind === "paywall") {
    return (
      <IntelligencePaywall
        title="Supplier intelligence"
        description="Supplier identity, awards, competitors, and incumbent signals stay locked until Pro is verified. This page does not load organisation names for free accounts."
        returnTo={returnTo}
      />
    );
  }

  const loaded = await readIntelligence(() =>
    loadSupplierIntelligence(organizationId, gate.access),
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
      <SupplierProfile intelligence={loaded.data} />
    </Main>
  );
}
