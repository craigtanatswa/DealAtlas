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
  type Guide,
} from "@/lib/guides/content";
import { resolveGuideWithLiveCount } from "@/lib/guides/live-count";
import { guideJsonLd } from "@/lib/guides/json-ld";
import { countPublishedDealsForGuides } from "@/lib/search/public";
import { marketingPageMetadata, NOINDEX_ROBOTS } from "@/lib/seo/metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Only published guides are pre-rendered; any other slug, including drafts, is a 404.
export const dynamicParams = false;

type PageProps = {
  params: Promise<{ slug: string }>;
};

async function resolveLiveCount(guide: Guide): Promise<Guide> {
  return resolveGuideWithLiveCount(guide, async () =>
    countPublishedDealsForGuides(await createSupabaseServerClient()),
  );
}

export function generateStaticParams() {
  return listPublishedGuides().map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getPublishedGuide(slug);
  if (!guide) {
    return { title: "Guide not found", robots: NOINDEX_ROBOTS };
  }
  const resolved = await resolveLiveCount(guide);
  const metadata = marketingPageMetadata({
    title: resolved.title,
    description: resolved.description,
    path: resolved.path,
    origin: getAppOrigin(),
    absoluteTitle: true,
  });
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      type: "article",
      publishedTime: resolved.datePublished,
      modifiedTime: resolved.updated,
    },
  };
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = getPublishedGuide(slug);
  if (!guide) {
    notFound();
  }

  const resolved = await resolveLiveCount(guide);
  const origin = getAppOrigin();

  return (
    <Main back className="gap-8">
      <JsonLd data={guideJsonLd(origin, resolved)} />
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
          <Heading>{resolved.h1}</Heading>
          <p className="text-sm text-muted-foreground">
            Updated <time dateTime={resolved.updated}>{formatGuideDate(resolved.updated)}</time>
          </p>
        </header>
        <GuideMarkdown blocks={resolved.blocks} publishedGuidePaths={publishedGuidePaths()} />
      </article>
    </Main>
  );
}
