import Link from "next/link";

import { LockedField } from "@/components/deals/locked-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

export const LOCKED_INTELLIGENCE_FIELDS = [
  { label: "Buyer identity", benefit: "See who is buying" },
  { label: "Exact deadline and value", benefit: "Exact deadline/value" },
  { label: "Source and application", benefit: "Source and application link" },
  { label: "Documents and requirements", benefit: "Documents and requirements" },
  { label: "Buyer and competitor intelligence", benefit: "Buyer/competitor intelligence" },
  { label: "Similar opportunity alerts", benefit: "Alerts for similar opportunities" },
] as const;

export function UnlockPanel({
  heading = "Unlock the buyer and pursue this opportunity",
  fields = LOCKED_INTELLIGENCE_FIELDS,
}: {
  heading?: string;
  fields?: readonly { label: string; benefit: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="font-heading text-base leading-snug font-semibold">
          {heading}
        </h2>
        <CardDescription>
          Pro reveals paid intelligence after a verified subscription. This panel
          never receives protected source values.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {fields.map((field) => (
          <LockedField
            key={field.label}
            label={field.label}
            benefit={field.benefit}
          />
        ))}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link href="/pricing">Unlock with DealAtlas Pro</Link>
        </Button>
        <Button asChild variant="link">
          <Link href="/pricing">View pricing</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
