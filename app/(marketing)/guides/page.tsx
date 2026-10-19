import type { Metadata } from "next";
import Link from "next/link";

import { Heading, Text } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { getAppOrigin } from "@/lib/auth/urls";
import { formatGuideDate, listPublishedGuides } from "@/lib/guides/content";
import { guidesIndexJsonLd } from "@/lib/guides/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { PUBLIC_PAGE_COPY } from "@/lib/seo/pages";

const copy = PUBLIC_PAGE_COPY.guides;

export function generateMetadata(): Metadata {
  return marketingPageMetadata({ ...copy, origin: getAppOrigin() });
}

export default function GuidesIndexPage() {
  const origin = getAppOrigin();
  const guides = listPublishedGuides();

  return (
    <Main back className="gap-10">
      <JsonLd
        data={guidesIndexJsonLd(origin, {
          name: copy.title,
          description: copy.description,
          guides,
        })}
      />
      <div className="flex max-w-3xl flex-col gap-3">
        <Heading>Guides</Heading>
        <Text variant="muted">{copy.description}</Text>
      </div>
      {guides.length === 0 ? (
        <Text variant="muted">Guides will appear here when they are published.</Text>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {guides.map((guide) => (
            <li key={guide.slug}>
              <Link
                href={guide.path}
                className="group flex h-full flex-col gap-3 rounded-lg border border-border bg-background p-5 transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <h2 className="font-heading text-lg font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">
                  {guide.h1}
                </h2>
                <p className="text-[0.9375rem] leading-7 text-muted-foreground">
                  {guide.description}
                </p>
                <p className="mt-auto text-sm font-medium text-muted-foreground">
                  Updated <time dateTime={guide.updated}>{formatGuideDate(guide.updated)}</time>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Main>
  );
}
