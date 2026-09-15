import type { Metadata } from "next";
import Link from "next/link";

import { LegalReviewCallout } from "@/components/legal/legal-review-callout";
import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { getAppOrigin } from "@/lib/auth/urls";
import { webPageJsonLd } from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { PUBLIC_PAGE_COPY } from "@/lib/seo/pages";

const origin = getAppOrigin();

export const metadata: Metadata = marketingPageMetadata({
  ...PUBLIC_PAGE_COPY.contact,
  origin,
});

export default function ContactPage() {
  return (
    <Main className="gap-8" width="narrow">
      <JsonLd
        data={webPageJsonLd({
          origin,
          path: PUBLIC_PAGE_COPY.contact.path,
          name: PUBLIC_PAGE_COPY.contact.title,
          description: PUBLIC_PAGE_COPY.contact.description,
        })}
      />
      <div className="flex flex-col gap-3">
        <Heading>Contact</Heading>
        <Text variant="muted">
          Use this page for product, privacy, and billing questions. DealAtlas
          does not accept procurement notices or source URLs through a public
          form.
        </Text>
      </div>
      <LegalReviewCallout>
        Replace the placeholder inbox, company name, and registered office with
        the live business details before launch. This block is draft operational
        copy, not a confirmed public contact identity.
      </LegalReviewCallout>
      <div className="flex flex-col gap-3 text-[0.9375rem] leading-7 text-muted-foreground">
        <p>
          Placeholder support inbox:{" "}
          <span className="text-foreground">support@dealatlas.example</span>
        </p>
        <p>
          Billing questions after a verified subscription should go through the
          in-app customer portal where possible. Dodo Payments remains the
          merchant of record for card charges.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/privacy">Privacy</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/pricing">Pricing</Link>
        </Button>
      </div>
    </Main>
  );
}
