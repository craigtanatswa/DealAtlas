"use client";

import { BrandMark } from "@/components/navigation/brand-mark";
import { MobileNav } from "@/components/navigation/mobile-nav";
import { NavLink } from "@/components/navigation/nav-link";
import { SignOutButton } from "@/components/account/sign-out-button";
import { ADMIN_NAV } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function AdminSidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "bg-sidebar text-sidebar-foreground flex w-64 shrink-0 flex-col border-r border-sidebar-border",
        className,
      )}
    >
      <div className="flex h-16 items-center px-4">
        <BrandMark href="/admin" suffix="Admin" tone="onDark" className="text-sidebar-foreground" />
      </div>
      <nav aria-label="Admin" className="flex flex-1 flex-col gap-1 px-3 py-4">
        {ADMIN_NAV.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            end={item.href === "/admin"}
            tone="sidebar"
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="flex flex-col gap-2 border-t border-sidebar-border p-4">
        <NavLink href="/app" tone="sidebar">
          Workspace
        </NavLink>
        <SignOutButton />
      </div>
    </aside>
  );
}

export function AdminMobileHeader() {
  return (
    <header className="border-b border-border bg-background lg:hidden">
      <div className="flex h-16 items-center justify-between gap-4 px-4">
        <BrandMark href="/admin" suffix="Admin" />
        <MobileNav title="Admin" description="Administration navigation">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              end={item.href === "/admin"}
              className="w-full"
            >
              {item.label}
            </NavLink>
          ))}
          <NavLink href="/app" className="w-full">
            Workspace
          </NavLink>
          <div className="pt-2">
            <SignOutButton />
          </div>
        </MobileNav>
      </div>
    </header>
  );
}
