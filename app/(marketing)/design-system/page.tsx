import type { Metadata } from "next";

import { DesignSystemCatalog } from "@/components/design-system/catalog";
import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";

export const metadata: Metadata = {
  title: "Component fixtures",
  robots: { index: false, follow: false },
};

export default function DesignSystemPage() {
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
