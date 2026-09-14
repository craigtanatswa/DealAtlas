import Link from "next/link";

import { ErrorState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export default function DealPreviewNotFound() {
  return (
    <Main>
      <ErrorState
        title="Opportunity preview not found"
        description="That preview is unpublished, was removed, or the link is incorrect. Free pages only show sanitised deal_previews."
      >
        <Button asChild>
          <Link href="/deals">Back to deals</Link>
        </Button>
      </ErrorState>
    </Main>
  );
}
