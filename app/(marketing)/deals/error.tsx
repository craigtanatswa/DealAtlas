"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";

export default function DealsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("DealAtlas deals search error", error.digest ?? error.name);
  }, [error]);

  return (
    <Main>
      <ErrorState
        title="Opportunities could not be loaded"
        description="Free search could not load sanitised previews. Try again, or come back shortly if listings are catching up."
        onRetry={reset}
      />
    </Main>
  );
}
