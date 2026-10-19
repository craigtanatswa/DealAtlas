import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GuideMarkdown } from "@/components/guides/guide-markdown";
import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { JsonLd } from "@/components/seo/json-ld";
import { getAppOrigin } from "@/lib/auth/urls";
import {
  formatGuideDate,
  getPublishedGuide,
  listPublishedGuides,
  publishedGuidePaths,
} from "@/lib/guides/content";
import { guideJsonLd } from "@/lib/guides/json-ld";
import { marketingPageMetadata, NOINDEX_ROBOTS } from "@/lib/seo/metadata";

// Only published guides are pre-rendered; any other slug, including drafts, is a 404.
export const dynamicParams = false;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return listPublishedGuides().map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getPublishedGuide(slug);
  if (!guide) {
    return { title: "Guide not found", robots: NOINDEX_ROBOTS };
  }
  const metadata = marketingPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guide.path,
    origin: getAppOrigin(),
    absoluteTitle: true,
  });
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      type: "article",
      publishedTime: guide.datePublished,
      modifiedTime: guide.updated,
    },
  };
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = getPublishedGuide(slug);
  if (!guide) {
    notFound();
  }

  const origin = getAppOrigin();

  return (
    <Main back className="gap-8">
      <JsonLd data={guideJsonLd(origin, guide)} />
      <article className="flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <nav aria-label="Breadcrumb" className="text-sm font-medium text-muted-foreground">
            <Link
              href="/guides"
              className="hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:rounded-sm focus-visible:outline-none"
            >
              Guides
            </Link>
          </nav>
          <Heading>{guide.h1}</Heading>
          <p className="text-sm text-muted-foreground">
            Updated <time dateTime={guide.updated}>{formatGuideDate(guide.updated)}</time>
          </p>
        </header>
        <GuideMarkdown blocks={guide.blocks} publishedGuidePaths={publishedGuidePaths()} />
      </article>
    </Main>
  );
}
