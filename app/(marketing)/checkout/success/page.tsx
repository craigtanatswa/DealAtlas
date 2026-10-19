import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ConfirmingSubscription } from "@/components/billing/confirming-subscription";
import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { getAuthUser } from "@/lib/auth/session";
import { loginPathWithNext, NEXT_INVALID_FALLBACK_PATH } from "@/lib/auth/redirect";
import { isAppDealPath, parseCheckoutReturnTo } from "@/lib/deals/paths";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { FREE_ENTITLEMENT } from "@/lib/entitlements/policy";

const PUBLIC_DEAL_PATH = /^\/deals\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const metadata: Metadata = {
  title: "Confirming subscription",
  robots: { index: false, follow: false },
};

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  void params.success;
  void params.status;
  void params.session_id;
  const rawNext =
    typeof params.next === "string"
      ? params.next
      : Array.isArray(params.next)
        ? params.next[0]
        : null;
  const afterConfirmHref =
    parseCheckoutReturnTo(rawNext) ??
    (rawNext ? NEXT_INVALID_FALLBACK_PATH : "/app");

  const user = await getAuthUser();
  if (!user) {
    return (
      <Main back>
        <Heading>Confirming subscription</Heading>
        <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground">
          Sign in to wait for verified Pro access. A checkout redirect is not
          payment confirmation.
        </p>
        <Button asChild>
          <Link href={loginPathWithNext("/checkout/success")}>Sign in</Link>
        </Button>
      </Main>
    );
  }

  const afterConfirmPath = afterConfirmHref.split("?")[0] ?? afterConfirmHref;
  if (isAppDealPath(afterConfirmPath) || PUBLIC_DEAL_PATH.test(afterConfirmPath)) {
    redirect(`${afterConfirmPath}?upgraded=1`);
  }

  const entitlement = await getCurrentEntitlement(user.id);

  return (
    <Main back>
      <Heading>Confirming subscription</Heading>
      <ConfirmingSubscription
        initialEntitlement={entitlement ?? FREE_ENTITLEMENT}
        afterConfirmHref={afterConfirmHref}
      />
    </Main>
  );
}
