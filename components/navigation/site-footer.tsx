import Link from "next/link";

import { BrandMark } from "@/components/navigation/brand-mark";
import { APP_DESCRIPTION, FOOTER_NAV } from "@/lib/constants";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-muted/50">
      <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-8 px-4 py-10 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
        <div className="max-w-sm">
          <BrandMark href="/" />
          <p className="mt-3 text-[0.9375rem] leading-7 text-muted-foreground">
            {APP_DESCRIPTION}
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {FOOTER_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:rounded-md focus-visible:outline-none"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
