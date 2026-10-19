import type { Metadata } from "next";
import Link from "next/link";

import { ErrorState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DealPreviewNotFound() {
  return (
    <Main back>
      <ErrorState
        title="Opportunity preview not found"
        description="That opportunity is unpublished, was removed, or the link is incorrect."
      >
        <Button asChild>
          <Link href="/deals">Back to deals</Link>
        </Button>
      </ErrorState>
    </Main>
  );
}
