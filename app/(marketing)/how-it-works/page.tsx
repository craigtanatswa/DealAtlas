import type { Metadata } from "next";
import Link from "next/link";

import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { getAppOrigin } from "@/lib/auth/urls";
import { webPageJsonLd } from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { HOW_IT_WORKS_STEPS, PUBLIC_PAGE_COPY } from "@/lib/seo/pages";

const origin = getAppOrigin();

export const metadata: Metadata = marketingPageMetadata({
  ...PUBLIC_PAGE_COPY.howItWorks,
  origin,
});

export default function HowItWorksPage() {
  return (
    <Main className="gap-10">
      <JsonLd
        data={webPageJsonLd({
          origin,
          path: PUBLIC_PAGE_COPY.howItWorks.path,
          name: PUBLIC_PAGE_COPY.howItWorks.title,
          description: PUBLIC_PAGE_COPY.howItWorks.description,
        })}
      />
      <div className="flex max-w-3xl flex-col gap-3">
        <Heading>How it works</Heading>
        <Text variant="muted">
          DealAtlas is built so you can discover and assess opportunities
          without receiving enough source-identifying data to bypass the
          product. The original buyer and notice stay locked until Pro is
          verified on the server.
        </Text>
      </div>
      <ol className="grid gap-4 md:grid-cols-2">
        {HOW_IT_WORKS_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex h-full flex-col gap-3 rounded-lg border border-border bg-background p-5"
          >
            <p className="text-sm font-medium text-muted-foreground">
              Step {index + 1}
            </p>
            <h2 className="font-heading text-lg font-semibold leading-snug">
              {step.title}
            </h2>
            <p className="text-[0.9375rem] leading-7 text-muted-foreground">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/deals">Find deals</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/pricing">View pricing</Link>
        </Button>
      </div>
    </Main>
  );
}
