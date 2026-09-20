import Link from "next/link";
import {
  BriefcaseIcon,
  Building2Icon,
  FactoryIcon,
  GraduationCapIcon,
  HammerIcon,
  HeartPulseIcon,
  MegaphoneIcon,
  MonitorIcon,
  PackageIcon,
  TruckIcon,
  UtensilsCrossedIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";

import { DEAL_CATEGORY_CATALOG } from "@/lib/matching/categories";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  technology: MonitorIcon,
  "professional-services": BriefcaseIcon,
  "construction-infrastructure": HammerIcon,
  "facilities-property": Building2Icon,
  healthcare: HeartPulseIcon,
  education: GraduationCapIcon,
  "transport-logistics": TruckIcon,
  "manufacturing-industrial": FactoryIcon,
  "marketing-creative": MegaphoneIcon,
  "food-catering": UtensilsCrossedIcon,
  "energy-utilities": ZapIcon,
  "office-business-supplies": PackageIcon,
};

export function categorySearchHref(name: string, path = "/deals") {
  return `${path}?category=${encodeURIComponent(name)}`;
}

export function CategoryShortcuts({
  path = "/deals",
  className,
}: {
  path?: string;
  className?: string;
}) {
  const categories = DEAL_CATEGORY_CATALOG.filter((item) => item.slug !== "other");

  return (
    <nav aria-label="Browse by category" className={cn("flex flex-col gap-4", className)}>
      <p className="text-sm font-medium text-foreground">Browse by category</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((category) => {
          const Icon = CATEGORY_ICONS[category.slug] ?? PackageIcon;
          return (
            <li key={category.slug}>
              <Link
                href={categorySearchHref(category.name, path)}
                className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 leading-snug">{category.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
