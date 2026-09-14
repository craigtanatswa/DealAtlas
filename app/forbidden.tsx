import Link from "next/link";

import { ErrorState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <Main>
      <ErrorState
        title="Access denied"
        description="You do not have permission to view this page."
      >
        <Button asChild>
          <Link href="/app">Back to workspace</Link>
        </Button>
      </ErrorState>
    </Main>
  );
}
