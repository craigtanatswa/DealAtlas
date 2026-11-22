import type { FoundingPublicCount } from "@/lib/billing/founding-ui";
import type { DealViewer } from "@/lib/deals/viewer";

export type DealUnlockProps = {
  mode: "anonymous" | "free" | "pro";
  loginHref: string;
  revealHref?: string;
  returnTo?: string;
  founding?: FoundingPublicCount;
  paymentPending?: boolean;
};

export function dealUnlockProps({
  viewer,
  slug,
  loginHref,
  founding,
}: {
  viewer: DealViewer | null;
  slug: string;
  loginHref: string;
  founding: FoundingPublicCount;
}): DealUnlockProps {
  if (viewer?.mode === "pro") {
    return {
      mode: "pro",
      loginHref,
      revealHref: viewer.revealHref,
      returnTo: viewer.returnTo,
      paymentPending: viewer.paymentPending,
    };
  }

  if (viewer?.mode === "free") {
    return {
      mode: "free",
      loginHref,
      returnTo: `/deals/${slug}`,
      founding: viewer.founding,
      paymentPending: viewer.paymentPending,
    };
  }

  return {
    mode: "anonymous",
    loginHref,
    founding,
  };
}
