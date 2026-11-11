import Link from "next/link";

import { categoryLandingForRawCategory } from "@/lib/seo/category-landings";

const LINK_CLASS =
  "rounded-sm hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none";

export function DealBreadcrumbs({
  preview,
}: {
  preview: { previewTitle: string; mainCategory: string | null };
}) {
  const hub = categoryLandingForRawCategory(preview.mainCategory);
  const crumbs: Array<{ name: string; path: string | null }> = [
    { name: "Home", path: "/" },
    { name: "Deals", path: "/deals" },
    ...(hub ? [{ name: hub.name, path: hub.path }] : []),
    { name: preview.previewTitle, path: null },
  ];

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground md:text-[0.8125rem]">
        {crumbs.map((crumb, index) => (
          <li
            key={`${crumb.name}-${index}`}
            className="inline-flex min-w-0 items-center gap-x-1"
          >
            {index > 0 ? <span aria-hidden="true">›</span> : null}
            {crumb.path ? (
              <Link href={crumb.path} className={LINK_CLASS}>
                {crumb.name}
              </Link>
            ) : (
              <span aria-current="page" className="truncate">
                {crumb.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
