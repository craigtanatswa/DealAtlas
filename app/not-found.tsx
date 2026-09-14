import Link from "next/link";

import { ErrorState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Main>
      <ErrorState
        title="Page not found"
        description="That page does not exist, or it has moved."
      >
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </ErrorState>
    </Main>
  );
}
