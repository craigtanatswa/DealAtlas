import type { Metadata } from "next";
import Link from "next/link";

import { Main } from "@/components/layout/container";
import { Heading, Text } from "@/components/layout/heading";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false },
};

export default function AlertsUnsubscribedPage() {
  return (
    <Main back className="gap-8" width="narrow">
      <div className="flex flex-col gap-3">
        <Heading>You&apos;re unsubscribed</Heading>
        <Text variant="muted">
          You won&apos;t get any more DealAtlas alert emails.
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
