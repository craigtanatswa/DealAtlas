import type { FoundingPublicCount } from "@/lib/billing/founding-ui";
import { appDealPath } from "@/lib/deals/paths";
import type { SafeMatchView } from "@/lib/matching/types";

export type DealViewerFree = {
  mode: "free";
  dealId: string;
  saved: boolean;
  used: number;
  limit: number | null;
  founding: FoundingPublicCount;
  paymentPending: boolean;
};

export type DealViewerPro = {
  mode: "pro";
  dealId: string;
  saved: boolean;
  used: number;
  limit: number | null;
  founding: null;
  paymentPending: boolean;
  revealHref: string;
  returnTo: string;
  match?: SafeMatchView;
};

export type DealViewer = DealViewerFree | DealViewerPro;

export type DealViewerBodyInput = {
  isPro: boolean;
  dealId: string;
  saved: boolean;
  used: number;
  limit: number | null;
  founding: FoundingPublicCount;
  paymentPending: boolean;
  match?: SafeMatchView | null;
};

export function buildDealViewerBody(
  input: DealViewerBodyInput,
): DealViewer {
  const shared = {
    dealId: input.dealId,
    saved: input.saved,
    used: input.used,
    limit: input.limit,
  };

  if (input.isPro) {
    const revealHref = appDealPath(input.dealId);
    return {
      mode: "pro",
      ...shared,
      founding: null,
      paymentPending: input.paymentPending,
      revealHref,
      returnTo: revealHref,
      ...(input.match ? { match: input.match } : {}),
    };
  }

  return {
    mode: "free",
    ...shared,
    founding: input.founding,
    paymentPending: input.paymentPending,
  };
}
