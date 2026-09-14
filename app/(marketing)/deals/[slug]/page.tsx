import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { Main } from "@/components/layout/container";
import { getPublicEnv } from "@/lib/env/public";
import { publicDealPreviewMetadata } from "@/lib/search/metadata";
import { getPublicDealPreviewBySlug } from "@/lib/search/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseInputSafe, slugSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const loadPreview = cache(async (slug: string) => {
  const parsed = parseInputSafe(slugSchema, slug);
  if (!parsed.success) {
    return null;
  }

  const client = await createSupabaseServerClient();
  return getPublicDealPreviewBySlug(client, parsed.data);
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const preview = await loadPreview(slug);

  if (!preview) {
    return {
      title: "Opportunity not found",
      robots: { index: false, follow: false },
    };
  }

  const origin = getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return publicDealPreviewMetadata(preview, `${origin}/deals/${preview.slug}`);
}

export default async function DealPreviewPage({ params }: PageProps) {
  const { slug } = await params;
  const preview = await loadPreview(slug);

  if (!preview) {
    notFound();
  }

  return (
    <Main>
      <DealPreviewDetail deal={preview} />
    </Main>
  );
}
