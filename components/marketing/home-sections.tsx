import Link from "next/link";

import { CategoryShortcuts } from "@/components/deals/category-shortcuts";
import { DealList } from "@/components/deals/deal-list";
import { HeroSearchForm } from "@/components/deals/hero-search-form";
import { EmptyState } from "@/components/feedback/empty-state";
import { Container } from "@/components/layout/container";
import { Heading, Text } from "@/components/layout/heading";
import { BrandLogo } from "@/components/navigation/brand-mark";
import { SectionHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { HOW_IT_WORKS_STEPS } from "@/lib/seo/pages";
import type { RankedDealSearchResult } from "@/lib/search/dto";

const VALUE_PROPS = [
  {
    title: "Discover opportunities faster",
    body: "Search contracts, supply requests and tenders in one place instead of checking portals one by one.",
  },
  {
    title: "Search multiple sectors together",
    body: "Move between construction, ICT, healthcare, facilities and other categories without leaving the database.",
  },
  {
    title: "Judge commercial fit first",
    body: "Free previews show what is being requested, the category, region band, value band and closing window.",
  },
  {
    title: "Unlock the source when ready",
    body: "Buyer identity, original notices and application links stay protected until a verified Pro subscription.",
  },
] as const;

export function HomeHero() {
  return (
    <section className="surface-hero border-b border-border">
      <Container className="flex flex-col items-center gap-8 py-12 text-center md:py-20">
        <div className="flex max-w-3xl flex-col items-center gap-4">
          <BrandLogo alt={APP_NAME} className="h-10 w-auto md:h-12" priority />
          <Heading>
            Find contracts worth pursuing, then unlock who is buying.
          </Heading>
          <Text variant="muted" className="max-w-2xl">
            Search real business opportunities, contracts, supply requests and
            deals. Browse useful free context first, then reveal the source when
            an opportunity is worth pursuing.
          </Text>
        </div>
        <div className="w-full max-w-3xl text-left">
          <HeroSearchForm />
        </div>
        <div className="w-full max-w-5xl text-left">
          <CategoryShortcuts />
        </div>
      </Container>
    </section>
  );
}

export function HomeOpportunitySections({
  latest,
  closingSoon,
}: {
  latest: RankedDealSearchResult;
  closingSoon: RankedDealSearchResult;
}) {
  const latestSlugs = new Set(latest.items.map((item) => item.preview.slug));
  const closingItems = closingSoon.items.filter(
    (item) => !latestSlugs.has(item.preview.slug),
  );

  return (
    <div className="flex flex-col gap-16">
      <section className="flex flex-col gap-6" aria-labelledby="latest-heading">
        <SectionHeader
          id="latest-heading"
          title="Latest opportunities"
          description="Published DealAtlas previews. Titles and summaries are sanitised; buyer and source identity stay locked."
          action={
            <Button asChild variant="outline">
              <Link href="/deals">View all opportunities</Link>
            </Button>
          }
        />
        {latest.items.length === 0 ? (
          <EmptyState
            title="No published opportunities yet"
            description="When sanitised previews are available they will appear here. This is not a live opportunity count."
          >
            <Button asChild variant="outline">
              <Link href="/deals">Open Find deals</Link>
            </Button>
          </EmptyState>
        ) : (
          <DealList items={latest.items} />
        )}
      </section>

      {closingItems.length > 0 ? (
        <section className="flex flex-col gap-6" aria-labelledby="closing-heading">
          <SectionHeader
            id="closing-heading"
            title="Closing soon"
            description="Opportunities already marked as closing soon in the sanitised preview set."
            action={
              <Button asChild variant="outline">
                <Link href="/deals?status=CLOSING_SOON">View closing soon</Link>
              </Button>
            }
          />
          <DealList items={closingItems} />
        </section>
      ) : null}
    </div>
  );
}

export function HomeValueSections() {
  return (
    <div className="flex flex-col gap-16">
      <section className="flex flex-col gap-6" aria-labelledby="how-heading">
        <SectionHeader
          id="how-heading"
          title="How DealAtlas works"
          description="Search and understand the work first. Registration is for saving, monitoring and unlocking the source."
        />
        <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex h-full flex-col gap-3 rounded-lg border border-border bg-background p-5"
            >
              <p className="text-sm font-medium text-muted-foreground">
                Step {index + 1}
              </p>
              <h3 className="font-heading text-base font-semibold leading-snug">
                {step.title}
              </h3>
              <p className="text-[0.9375rem] leading-6 text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-6" aria-labelledby="value-heading">
        <SectionHeader
          id="value-heading"
          title="Why suppliers use DealAtlas"
          description="Useful product behaviour, not invented live counts or customer claims."
        />
        <ul className="grid gap-4 sm:grid-cols-2">
          {VALUE_PROPS.map((item) => (
            <li
              key={item.title}
              className="rounded-lg border border-border bg-background p-5"
            >
              <h3 className="font-heading text-base font-semibold leading-snug">
                {item.title}
              </h3>
              <p className="mt-2 text-[0.9375rem] leading-6 text-muted-foreground">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 px-6 py-8 md:flex-row md:items-center md:justify-between"
        aria-labelledby="unlock-heading"
      >
        <div className="max-w-2xl">
          <Heading id="unlock-heading" level={2}>
            Unlock the source when a deal is worth it
          </Heading>
          <Text variant="muted" className="mt-2">
            Pro reveals who is buying, the original source, deadlines, contacts
            and documents after the billing provider confirms the subscription.
          </Text>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/pricing">View pricing</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/how-it-works">How it works</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
