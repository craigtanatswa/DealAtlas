import Link from "next/link";

import { ErrorState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export default function AppDealNotFound() {
  return (
    <Main>
      <ErrorState
        title="Opportunity not found"
        description="That deal is unpublished, was removed, or the link is incorrect. Protected source data is never shown without a verified Pro subscription."
      >
        <Button asChild>
          <Link href="/deals">Back to deals</Link>
        </Button>
      </ErrorState>
    </Main>
  );
}
