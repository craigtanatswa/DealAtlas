import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DealCard, cardDataFromPublicCardPreview } from "@/components/deals/deal-card";
import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { getAppOrigin } from "@/lib/auth/urls";
import { listPublicCardPreviews } from "@/lib/deals/public-card-previews";
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
  const [previews, subsectionPreviews] = await Promise.all([
    listPublicCardPreviews(client, {
      category: landing.name,
      limit: 24,
    }),
    landing.subsection
      ? listPublicCardPreviews(client, {
          category: landing.name,
          query: landing.subsection.query,
          statuses: ["OPEN", "CLOSING_SOON"],
          limit: 24,
        })
      : Promise.resolve([]),
  ]);
  const cards = previews.map(cardDataFromPublicCardPreview);
  const subsectionCards = subsectionPreviews.map(cardDataFromPublicCardPreview);
  const showSubsection = Boolean(
    landing.subsection && subsectionCards.length >= landing.subsection.minCards,
  );

  return (
    <Main back className="gap-10">
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
        <Heading>{landing.h1 ?? landing.title}</Heading>
        <p className="text-sm font-medium text-muted-foreground">
          <Link
            href="/categories"
            className="hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:rounded-sm focus-visible:outline-none"
          >
            Categories
          </Link>
        </p>
        <Text variant="muted">{landing.summary}</Text>
        <p>
          <Button asChild>
            <Link href={`/deals?category=${encodeURIComponent(landing.name)}`}>
              Search this category
            </Link>
          </Button>
        </p>
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
          Open {landing.name} tenders
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
                <DealCard compact deal={deal} />
              </li>
            ))}
          </ul>
        )}
        {landing.guide ? (
          <Text variant="muted">
            Read the{" "}
            <Link
              href={landing.guide.href}
              className="font-medium text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:rounded-sm focus-visible:outline-none"
            >
              {landing.guide.anchor}
            </Link>
            .
          </Text>
        ) : null}
        <p>
          <Button asChild variant="outline">
            <Link href={`/deals?category=${encodeURIComponent(landing.name)}`}>
              View all opportunities
            </Link>
          </Button>
        </p>
        <Text variant="meta" className="text-muted-foreground">
          This category page is the main landing. Filtered search URLs are not
          indexed.
        </Text>
      </section>
      {showSubsection && landing.subsection ? (
        <section
          className="flex flex-col gap-4"
          aria-labelledby={landing.subsection.id}
        >
          <Heading id={landing.subsection.id} level={2}>
            {landing.subsection.heading}
          </Heading>
          <Text variant="muted">{landing.subsection.intro}</Text>
          <ul className="grid gap-4">
            {subsectionCards.map((deal) => (
              <li key={deal.slug}>
                <DealCard compact deal={deal} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Main>
  );
}
