"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  pro?: boolean;
};

function isActivePath(pathname: string, href: string) {
  if (pathname === href) {
    return true;
  }

  if (href === "/app" || href === "/admin") {
    return false;
  }

  return pathname.startsWith(`${href}/`);
}

export function NavLink({
  href,
  children,
  className,
  onClick,
  end,
  tone = "default",
}: {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  end?: boolean;
  tone?: "default" | "sidebar" | "bar";
}) {
  const pathname = usePathname();
  const active = end ? pathname === href : isActivePath(pathname, href);

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 items-center text-sm font-medium transition-colors duration-150 ease-out focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        tone === "sidebar"
          ? cn(
              "rounded-md px-2 py-1.5",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )
          : tone === "bar"
            ? cn(
                "rounded-sm px-0.5",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )
            : cn(
                "rounded-md px-2 py-1.5",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              ),
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function NavItemLabel({ item }: { item: NavItem }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {item.label}
      {item.pro ? (
        <Badge variant="outline" className="font-medium">
          Pro
        </Badge>
      ) : null}
    </span>
  );
}
