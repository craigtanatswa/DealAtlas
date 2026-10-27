import type { Metadata } from "next";
import Link from "next/link";

import { Main } from "@/components/layout/container";
import { Heading, Text } from "@/components/layout/heading";
import { Button } from "@/components/ui/button";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Alerts confirmed",
  robots: { index: false },
};

export default async function AlertsConfirmedPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const invalid = status === "invalid";

  return (
    <Main back className="gap-8" width="narrow">
      <div className="flex flex-col gap-3">
        <Heading>{invalid ? "This link has expired" : "Alerts confirmed"}</Heading>
        <Text variant="muted">
          {invalid
            ? "This confirmation link has expired or has already been used. Sign up again from any deal page to get a new link."
            : "You'll get free email alerts for new opportunities. You can unsubscribe from any alert email."}
        </Text>
      </div>
      <div>
        <Button asChild variant="outline">
          <Link href="/deals">Browse opportunities</Link>
        </Button>
      </div>
    </Main>
  );
}
