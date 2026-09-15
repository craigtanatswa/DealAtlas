import type { Metadata } from "next";
import Link from "next/link";

import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAppOrigin } from "@/lib/auth/urls";
import { APP_NAME } from "@/lib/constants";
import { organizationJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { HOW_IT_WORKS_STEPS, PUBLIC_PAGE_COPY } from "@/lib/seo/pages";
import { indexableCategoryLandings } from "@/lib/seo/category-landings";

const origin = getAppOrigin();

export const metadata: Metadata = marketingPageMetadata({
  title: PUBLIC_PAGE_COPY.home.title,
  description: PUBLIC_PAGE_COPY.home.description,
  path: PUBLIC_PAGE_COPY.home.path,
  origin,
  absoluteTitle: true,
});

export default function HomePage() {
  const categories = indexableCategoryLandings();

  return (
    <Main className="gap-16">
      <JsonLd
        data={[
          organizationJsonLd(origin),
          webPageJsonLd({
            origin,
            path: "/",
            name: PUBLIC_PAGE_COPY.home.title,
            description: PUBLIC_PAGE_COPY.home.description,
          }),
        ]}
      />
      <section className="flex max-w-3xl flex-col gap-6">
        <p className="text-sm font-medium text-muted-foreground">{APP_NAME}</p>
        <Heading>
          Find contracts worth pursuing, then unlock who is buying.
        </Heading>
        <Text variant="muted" className="max-w-2xl">
          DealAtlas is UK-first B2B opportunity intelligence. Browse sanitised
          public and private-sector opportunities, judge fit, and reveal buyer
          identity only after a verified Pro subscription.
        </Text>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/deals">Find deals</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/how-it-works">How it works</Link>
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-6" aria-labelledby="how-heading">
        <Heading id="how-heading" level={2}>
          How DealAtlas works
        </Heading>
        <ol className="grid gap-4 md:grid-cols-2">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <li key={step.title}>
              <Card className="h-full">
                <CardHeader>
                  <p className="text-sm font-medium text-muted-foreground">
                    Step {index + 1}
                  </p>
                  <CardTitle>{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-[0.9375rem] leading-6">
                    {step.body}
                  </CardDescription>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-6" aria-labelledby="trust-heading">
        <Heading id="trust-heading" level={2}>
          Source identity stays locked on free pages
        </Heading>
        <Text variant="muted" className="max-w-3xl">
          Anonymous and free visitors only receive sanitised deal_previews.
          Buyer names, exact source titles, notice identifiers, and source URLs
          are not sent to the browser, metadata, or sitemaps. That is a
          product-security rule, not a CSS hide.
        </Text>
      </section>

      <section className="flex flex-col gap-6" aria-labelledby="categories-heading">
        <div className="flex flex-col gap-2">
          <Heading id="categories-heading" level={2}>
            Browse by category
          </Heading>
          <Text variant="muted" className="max-w-3xl">
            A small set of curated landings — not a page for every search
            filter. Each category explains the work you will see in anonymised
            form.
          </Text>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <li key={category.slug}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>
                    <Link
                      href={category.path}
                      className="rounded-sm hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {category.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>{category.summary}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
        <p>
          <Button asChild variant="outline">
            <Link href="/categories">All category landings</Link>
          </Button>
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="pricing-heading">
        <Heading id="pricing-heading" level={2}>
          Unlock the source when a deal is worth it
        </Heading>
        <Text variant="muted" className="max-w-3xl">
          Pro reveals who is buying, the original source, deadlines, contacts,
          and documents after the billing provider confirms the subscription.
        </Text>
        <div>
          <Button asChild>
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
      </section>
    </Main>
  );
}
