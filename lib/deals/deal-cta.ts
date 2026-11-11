import { DEAL_PAGE_UTM_CONTENT, withCtaUtm } from "@/lib/analytics/cta-utm";
import { checkoutPathForPlan, SIGNUP_PATH } from "@/lib/auth/redirect";
import { foundingCheckoutPath } from "@/lib/billing/founding-ui";

export const DEAL_PAGE_LIFETIME_SIGNUP_HREF = withCtaUtm(
  `${SIGNUP_PATH}?next=${encodeURIComponent(withCtaUtm(foundingCheckoutPath(), DEAL_PAGE_UTM_CONTENT))}`,
  DEAL_PAGE_UTM_CONTENT,
);

export function dealPagePlanSignupHref(
  plan: "PRO_MONTHLY" | "PRO_ANNUAL",
): string {
  return withCtaUtm(
    `${SIGNUP_PATH}?plan=${plan}&next=${encodeURIComponent(withCtaUtm(checkoutPathForPlan(plan), DEAL_PAGE_UTM_CONTENT))}`,
    DEAL_PAGE_UTM_CONTENT,
  );
}
