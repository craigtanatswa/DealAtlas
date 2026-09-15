import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DealCard } from "@/components/deals/deal-card";
import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { getAppOrigin } from "@/lib/auth/urls";
import { listPublishedDealPreviews } from "@/lib/db/previews";
import { toDealCardData, toPublicDealPreview } from "@/lib/search/dto";
import {
  getCategoryLanding,
  indexableCategoryLandings,
} from "@/lib/seo/category-landings";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { createSupabaseAnonymousClient } from "@/lib/supabase/anonymous";

export const dynamic = "force-dynamic";
export const dynamicParams = false;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return indexableCategoryLandings().map((landing) => ({ slug: landing.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const landing = getCategoryLanding(slug);
  if (!landing) {
    return { title: "Category not found", robots: { index: false, follow: false } };
  }
  return marketingPageMetadata({
    title: landing.title,
    description: landing.description,
    path: landing.path,
    origin: getAppOrigin(),
  });
}

export default async function CategoryLandingPage({ params }: PageProps) {
  const { slug } = await params;
  const landing = getCategoryLanding(slug);
  if (!landing) {
    notFound();
  }

  const origin = getAppOrigin();
  const client = createSupabaseAnonymousClient();
  const rows = await listPublishedDealPreviews(client, {
    category: landing.name,
    limit: 6,
  });
  const cards = rows.map((row) => toDealCardData(toPublicDealPreview(row)));

  return (
    <Main className="gap-10">
      <JsonLd
        data={[
          webPageJsonLd({
            origin,
            path: landing.path,
            name: landing.title,
            description: landing.description,
          }),
          breadcrumbJsonLd(origin, [
            { name: "Home", path: "/" },
            { name: "Categories", path: "/categories" },
            { name: landing.name, path: landing.path },
          ]),
        ]}
      />
      <div className="flex max-w-3xl flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          <Link
            href="/categories"
            className="hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:rounded-sm focus-visible:outline-none"
          >
            Categories
          </Link>
        </p>
        <Heading>{landing.title}</Heading>
        <Text variant="muted">{landing.summary}</Text>
      </div>
      {landing.body.map((paragraph) => (
        <Text key={paragraph.slice(0, 24)} variant="muted" className="max-w-3xl">
          {paragraph}
        </Text>
      ))}
      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <Heading level={2}>Typical buyers</Heading>
          <Text variant="muted" className="mt-2">
            {landing.typicalBuyers}
          </Text>
        </div>
        <div>
          <Heading level={2}>What free pages show</Heading>
          <Text variant="muted" className="mt-2">
            {landing.whatYouSeeFree}
          </Text>
        </div>
      </section>
      <section className="flex flex-col gap-4" aria-labelledby="samples-heading">
        <Heading id="samples-heading" level={2}>
          Recent sanitised previews
        </Heading>
        {cards.length === 0 ? (
          <Text variant="muted">
            Published previews in this category will appear here when they are
            available. Empty landings are not filled with invented opportunity
            counts.
          </Text>
        ) : (
          <ul className="grid gap-4">
            {cards.map((deal) => (
              <li key={deal.slug}>
                <DealCard deal={deal} />
              </li>
            ))}
          </ul>
        )}
        <p>
          <Button asChild variant="outline">
            <Link href={`/deals?category=${encodeURIComponent(landing.name)}`}>
              Open this category in Find deals
            </Link>
          </Button>
        </p>
        <Text variant="meta" className="text-muted-foreground">
          Filtered Find deals URLs are noindex. This category landing is the
          indexable page.
        </Text>
      </section>
    </Main>
  );
}
