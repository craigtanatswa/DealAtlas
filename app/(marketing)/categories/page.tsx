import type { Metadata } from "next";
import Link from "next/link";

import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { getAppOrigin } from "@/lib/auth/urls";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { indexableCategoryLandings } from "@/lib/seo/category-landings";
import { PUBLIC_PAGE_COPY } from "@/lib/seo/pages";

const origin = getAppOrigin();

export const metadata: Metadata = marketingPageMetadata({
  ...PUBLIC_PAGE_COPY.categories,
  origin,
});

export default function CategoriesIndexPage() {
  const landings = indexableCategoryLandings();

  return (
    <Main className="gap-10">
      <JsonLd
        data={[
          webPageJsonLd({
            origin,
            path: PUBLIC_PAGE_COPY.categories.path,
            name: PUBLIC_PAGE_COPY.categories.title,
            description: PUBLIC_PAGE_COPY.categories.description,
          }),
          breadcrumbJsonLd(origin, [
            { name: "Home", path: "/" },
            { name: "Categories", path: "/categories" },
          ]),
        ]}
      />
      <div className="flex max-w-3xl flex-col gap-3">
        <Heading>Opportunity categories</Heading>
        <Text variant="muted">
          These landings are a fixed catalogue of useful category pages. DealAtlas
          does not generate an indexable URL for every search filter, region, or
          keyword combination.
        </Text>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {landings.map((landing) => (
          <li key={landing.slug}>
            <Link
              href={landing.path}
              className="flex h-full flex-col gap-2 rounded-lg border border-border bg-background p-5 transition-colors hover:border-primary/30 hover:bg-muted/20 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <h2 className="font-heading text-base font-semibold leading-snug">
                {landing.name}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {landing.summary}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Main>
  );
}
