import type { ReactNode } from "react";

import { Heading } from "@/components/layout/heading";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const EMPTY_STATE_COPY = {
  noDealsMatchFilters: {
    title: "No deals match these filters",
    description:
      "Try a broader region, category, or closing window. Free search never includes source identity.",
  },
  ingestionStale: {
    title: "Listings are catching up",
    description:
      "The latest source update is still landing. This message is a status notice, not a live opportunity count.",
  },
  paidDataUnavailable: {
    title: "Paid details are not available for this opportunity",
    description:
      "The sanitised preview remains available. Buyer and source data require a verified Pro subscription.",
  },
  paymentConfirming: {
    title: "Payment is still confirming",
    description:
      "Pro access is granted after the billing provider confirms the subscription, not when checkout redirects.",
  },
  exportLimitReached: {
    title: "Export limit reached",
    description: "This workspace has used its export allowance for the current period.",
  },
  savedSearchLimitReached: {
    title: "Saved search limit reached",
    description:
      "Free accounts can save one search. Upgrade to Pro for additional saved searches.",
  },
} as const;

export type EmptyStateKind = keyof typeof EMPTY_STATE_COPY;

export function EmptyState({
  kind,
  title,
  description,
  className,
  children,
}: {
  kind?: EmptyStateKind;
  title?: string;
  description?: string;
  className?: string;
  children?: ReactNode;
}) {
  const copy = kind ? EMPTY_STATE_COPY[kind] : undefined;

  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10",
        className,
      )}
    >
      <Heading level={2} className="text-xl md:text-xl">
        {title ?? copy?.title}
      </Heading>
      <p className="mt-2 max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground">
        {description ?? copy?.description}
      </p>
      {children ? <div className="mt-6 flex flex-wrap gap-3">{children}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "The page could not be loaded. Try again, or return home if the problem continues.",
  onRetry,
  children,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Heading level={1}>{title}</Heading>
      <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground">
        {description}
      </p>
      <div className="flex flex-wrap gap-3">
        {onRetry ? (
          <Button type="button" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
        {children}
      </div>
    </div>
  );
}
