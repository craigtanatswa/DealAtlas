import type { Metadata } from "next";
import Link from "next/link";

import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <ul className="grid gap-4 md:grid-cols-2">
        {landings.map((landing) => (
          <li key={landing.slug}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>
                  <Link
                    href={landing.path}
                    className="rounded-sm hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {landing.name}
                  </Link>
                </CardTitle>
                <CardDescription>{landing.summary}</CardDescription>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ul>
    </Main>
  );
}
