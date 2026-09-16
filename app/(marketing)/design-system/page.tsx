import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { DesignSystemCatalog } from "@/components/design-system/catalog";
import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { shouldHideDesignSystem } from "@/lib/env/production";

export const metadata: Metadata = {
  title: "Component fixtures",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DesignSystemPage() {
  const host = (await headers()).get("host");
  if (
    shouldHideDesignSystem(
      {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV,
      },
      host,
    )
  ) {
    notFound();
  }

  return (
    <Main className="gap-8">
      <p className="text-sm font-medium text-muted-foreground">Design system</p>
      <Heading>Component fixtures</Heading>
      <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground md:text-base">
        Dummy stories for visual and keyboard review. This page is not linked
        from public navigation and does not present live product data.
      </p>
      <DesignSystemCatalog />
    </Main>
  );
}
