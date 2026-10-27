import type { Metadata } from "next";

import { PricingPlans } from "@/components/billing/pricing-plans";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { getAuthUser } from "@/lib/auth/session";
import { getAppOrigin } from "@/lib/auth/urls";
import { readFoundingAvailability } from "@/lib/billing/founding-public";
import { webPageJsonLd } from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { PUBLIC_PAGE_COPY } from "@/lib/seo/pages";

const origin = getAppOrigin();

export const dynamic = "force-dynamic";

export const metadata: Metadata = marketingPageMetadata({
  ...PUBLIC_PAGE_COPY.pricing,
  origin,
});

export default async function PricingPage() {
  const [user, founding] = await Promise.all([
    getAuthUser(),
    readFoundingAvailability(),
  ]);

  return (
    <Main back className="gap-10">
      <JsonLd
        data={webPageJsonLd({
          origin,
          path: PUBLIC_PAGE_COPY.pricing.path,
          name: PUBLIC_PAGE_COPY.pricing.title,
          description: PUBLIC_PAGE_COPY.pricing.description,
        })}
      />
      {/* Founding full or not offered: PricingPlans drops the founding card entirely. */}
      <PricingPlans signedIn={Boolean(user)} founding={founding ?? undefined} />
      <p className="text-center text-sm text-muted-foreground">
        All prices include VAT.
      </p>
    </Main>
  );
}
