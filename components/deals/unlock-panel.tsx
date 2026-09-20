import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { LockedField } from "@/components/deals/locked-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import Link from "next/link";

export const LOCKED_INTELLIGENCE_FIELDS = [
  { label: "Buyer identity", benefit: "Available to subscribers" },
  { label: "Original source", benefit: "Unlock source" },
  { label: "Official notice", benefit: "Subscription required" },
  { label: "Reference number", benefit: "Unlock full details" },
  { label: "Documents and requirements", benefit: "Documents and requirements" },
  { label: "Buyer and competitor intelligence", benefit: "Buyer/competitor intelligence" },
] as const;

export type UnlockCtaMode = "anonymous" | "free" | "pro";

export function UnlockPanel({
  heading = "Unlock the buyer and pursue this opportunity",
  fields = LOCKED_INTELLIGENCE_FIELDS,
  mode = "anonymous",
  loginHref = "/login?next=/pricing",
  revealHref,
  returnTo,
}: {
  heading?: string;
  fields?: readonly { label: string; benefit: string }[];
  mode?: UnlockCtaMode;
  loginHref?: string;
  revealHref?: string;
  returnTo?: string;
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
            documents, and provenance. This public page stays a sanitised preview.
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

  return (
    <Card>
      <CardHeader>
        <h2 className="font-heading text-base leading-snug font-semibold">
          {heading}
        </h2>
        <CardDescription>
          You already have the commercial context. Pro reveals who is buying,
          the original notice, and how to apply after a verified subscription.
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
      <CardFooter className="flex flex-wrap items-center gap-3">
        {mode === "free" ? (
          <CheckoutPlanForm
            planKey="PRO_MONTHLY"
            label="Unlock with DealAtlas Pro"
            returnTo={returnTo}
          />
        ) : (
          <Button asChild>
            <Link href={loginHref}>Unlock with DealAtlas Pro</Link>
          </Button>
        )}
        <Button asChild variant="link">
          <Link href="/pricing">View pricing</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
