import type { ReactNode } from "react";
import type { Metadata } from "next";

import { SiteFooter } from "@/components/navigation/site-footer";
import { BrandMark } from "@/components/navigation/brand-mark";
import { NOINDEX_ROBOTS } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export default function AuthRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-[80rem] items-center px-4 sm:px-6 lg:px-8">
          <BrandMark href="/" priority />
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 sm:px-6"
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
