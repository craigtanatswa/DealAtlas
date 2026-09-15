import { UnlockPanel } from "@/components/deals/unlock-panel";
import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";

export const LOCKED_INTELLIGENCE_FIELDS = [
  { label: "Organisation identity", benefit: "See who is buying or supplying" },
  { label: "Procurement history", benefit: "Buyer and supplier award history" },
  { label: "Incumbent signals", benefit: "Known incumbents where evidence exists" },
  { label: "Contract dates", benefit: "Start, end, and extension dates" },
  { label: "Renewal windows", benefit: "Upcoming renewal opportunities" },
] as const;

export function IntelligencePaywall({
  title,
  description,
  returnTo,
}: {
  title: string;
  description: string;
  returnTo: string;
}) {
  return (
    <Main className="gap-8">
      <div className="flex flex-col gap-2">
        <Heading>{title}</Heading>
        <Text variant="muted" className="max-w-3xl">
          {description}
        </Text>
      </div>
      <UnlockPanel
        heading="Unlock buyer and supplier intelligence"
        fields={LOCKED_INTELLIGENCE_FIELDS}
        mode="free"
        returnTo={returnTo}
      />
    </Main>
  );
}
