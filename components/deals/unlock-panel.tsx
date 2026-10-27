import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { FoundingUnlockActions } from "@/components/billing/founding-unlock-actions";
import { LockedField } from "@/components/deals/locked-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  foundingUiState,
  type FoundingPublicCount,
} from "@/lib/billing/founding-ui";
import { signupPathForPlan } from "@/lib/auth/redirect";
import Link from "next/link";

export const LOCKED_INTELLIGENCE_FIELDS = [
  { label: "Buyer identity", benefit: "Available to subscribers" },
  { label: "Original source", benefit: "Unlock source" },
  { label: "Official notice", benefit: "Subscription required" },
  { label: "Reference number", benefit: "Unlock full details" },
  { label: "Documents and requirements", benefit: "Documents and requirements" },
] as const;

export type UnlockCtaMode = "anonymous" | "free" | "pro";

export function UnlockPanel({
  heading = "Unlock the buyer and pursue this opportunity",
  fields = LOCKED_INTELLIGENCE_FIELDS,
  mode = "anonymous",
  revealHref,
  returnTo,
  founding,
  hasScope = false,
}: {
  heading?: string;
  fields?: readonly { label: string; benefit: string }[];
  mode?: UnlockCtaMode;
  loginHref?: string;
  revealHref?: string;
  returnTo?: string;
  /** Counts only. Omitted, or not offered, keeps the standard Pro CTA. */
  founding?: FoundingPublicCount;
  hasScope?: boolean;
}) {
  if (mode === "pro") {
    return (
      <Card>
        <CardHeader>
          <h2 className="font-heading text-base leading-snug font-semibold">
            Exact source details are available
          </h2>
          <CardDescription>
            Open the Pro workspace view for buyer identity, source links,
            documents, and provenance.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href={revealHref ?? "/app"}>Open exact source details</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const foundingState = foundingUiState(founding);

  return (
    <Card>
      <CardHeader>
        <h2 className="font-heading text-base leading-snug font-semibold">
          {heading}
        </h2>
        <CardDescription>
          {hasScope
            ? "You already have the commercial context. Pro reveals who is buying, the original notice, and how to apply after a verified subscription."
            : "Pro reveals who is buying, the original notice, and how to apply after a verified subscription."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {fields.map((field) => (
          <LockedField
            key={field.label}
            label={field.label}
            benefit={field.benefit}
          />
        ))}
      </CardContent>
      <CardFooter
        className={
          foundingState === "hidden"
            ? "flex flex-wrap items-center gap-3"
            : "flex-col items-stretch gap-2"
        }
      >
        {foundingState === "hidden" ? (
          <>
            {mode === "free" ? (
              <CheckoutPlanForm
                planKey="PRO_MONTHLY"
                label="Unlock with DealAtlas Pro"
                returnTo={returnTo}
              />
            ) : (
              <Button asChild>
                <Link href={signupPathForPlan("PRO_MONTHLY")}>Unlock with DealAtlas Pro</Link>
              </Button>
            )}
            <Button asChild variant="link">
              <Link href="/pricing">View pricing</Link>
            </Button>
          </>
        ) : (
          <FoundingUnlockActions
            founding={founding}
            mode={mode === "free" ? "free" : "anonymous"}
            returnTo={returnTo}
          />
        )}
      </CardFooter>
    </Card>
  );
}
