"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("DealAtlas route error", error.digest ?? error.name);
  }, [error]);

  return (
    <Main>
      <ErrorState onRetry={reset} />
    </Main>
  );
}
