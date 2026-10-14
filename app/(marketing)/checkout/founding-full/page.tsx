import type { Metadata } from "next";

import { FoundingFullNotice } from "@/components/billing/founding-full-notice";
import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { loginPathWithNext } from "@/lib/auth/redirect";
import { getAuthUser } from "@/lib/auth/session";
import { parseCheckoutReturnTo } from "@/lib/deals/paths";
import {
  getPublicDealPreviewPageByDealId,
  getPublicDealPreviewPageBySlug,
} from "@/lib/search/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

/** Preview title only. Paid buyer and source fields are never loaded here. */
async function previewTitleForReturn(next: string | null): Promise<string | null> {
  if (!next) return null;
  const path = next.split("?")[0] ?? next;
  const publicDeal = path.match(/^\/deals\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  const appDeal = path.match(
    /^\/app\/deals\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  );
  if (!publicDeal && !appDeal) return null;
  try {
    const client = await createSupabaseServerClient();
    if (publicDeal?.[1]) {
      const page = await getPublicDealPreviewPageBySlug(client, publicDeal[1], {
        signedIn: false,
      });
      return page?.preview.previewTitle ?? null;
    }
    if (appDeal?.[1]) {
      const page = await getPublicDealPreviewPageByDealId(client, appDeal[1]);
      return page?.preview.previewTitle ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

export default async function FoundingFullPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = parseCheckoutReturnTo(firstParam(params.next));
  const [user, returnTitle] = await Promise.all([
    getAuthUser(),
    previewTitleForReturn(returnTo),
  ]);

  return (
    <Main width="narrow" className="gap-6">
      <Heading>Checkout</Heading>
      <FoundingFullNotice
        signedIn={Boolean(user)}
        loginHref={loginPathWithNext(returnTo ?? "/checkout/founding-full")}
        returnTo={returnTo ?? undefined}
        returnTitle={returnTitle}
      />
    </Main>
  );
}
