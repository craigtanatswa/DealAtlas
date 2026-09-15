import type { ReactNode } from "react";

import { LegalReviewCallout } from "@/components/legal/legal-review-callout";
import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";

export function LegalDocument({
  title,
  intro,
  reviewNote,
  children,
}: {
  title: string;
  intro: string;
  reviewNote: string;
  children: ReactNode;
}) {
  return (
    <Main className="gap-8" width="narrow">
      <div className="flex flex-col gap-3">
        <Heading>{title}</Heading>
        <Text variant="muted">{intro}</Text>
      </div>
      <LegalReviewCallout>{reviewNote}</LegalReviewCallout>
      <article className="flex flex-col gap-8">{children}</article>
    </Main>
  );
}

export function LegalSection({
  title,
  children,
  review,
}: {
  title: string;
  children: ReactNode;
  review?: boolean;
}) {
  return (
    <section className="flex flex-col gap-3">
      <Heading level={2} className="text-[1.5rem] md:text-[1.75rem]">
        {title}
        {review ? (
          <span className="mt-2 block text-sm font-medium text-warning-foreground">
            Requires final business/legal review
          </span>
        ) : null}
      </Heading>
      <div className="flex flex-col gap-3 text-[0.9375rem] leading-7 text-muted-foreground md:text-base">
        {children}
      </div>
    </section>
  );
}
