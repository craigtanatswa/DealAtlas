"use client";

import Link from "next/link";

import { SignOutButton } from "@/components/account/sign-out-button";
import { BrandMark } from "@/components/navigation/brand-mark";
import { MobileNav } from "@/components/navigation/mobile-nav";
import { NavItemLabel, NavLink } from "@/components/navigation/nav-link";
import { Button } from "@/components/ui/button";
import { AUTH_NAV, PUBLIC_NAV } from "@/lib/constants";

export function SiteHeader({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[80rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandMark href="/" />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {PUBLIC_NAV.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
          {isAuthenticated ? (
            <>
              <NavLink href="/app">Workspace</NavLink>
              <SignOutButton />
            </>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link href={AUTH_NAV[0].href}>{AUTH_NAV[0].label}</Link>
              </Button>
              <Button asChild>
                <Link href={AUTH_NAV[1].href}>{AUTH_NAV[1].label}</Link>
              </Button>
            </>
          )}
        </nav>
        <MobileNav title="DealAtlas" description="Public navigation">
          {PUBLIC_NAV.map((item) => (
            <NavLink key={item.href} href={item.href} className="w-full">
              {item.label}
            </NavLink>
          ))}
          {isAuthenticated ? (
            <NavLink href="/app" className="w-full">
              Workspace
            </NavLink>
          ) : (
            AUTH_NAV.map((item) => (
              <NavLink key={item.href} href={item.href} className="w-full">
                <NavItemLabel item={item} />
              </NavLink>
            ))
          )}
          {isAuthenticated ? (
            <div className="pt-2">
              <SignOutButton />
            </div>
          ) : null}
        </MobileNav>
      </div>
    </header>
  );
}
