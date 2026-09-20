"use client";

import Link from "next/link";

import { SignOutButton } from "@/components/account/sign-out-button";
import { BrandMark } from "@/components/navigation/brand-mark";
import { HeaderSearch } from "@/components/navigation/header-search";
import {
  HEADER_ACTIONS_CLASS,
  HEADER_BAR_CLASS,
  HEADER_BAR_INNER_CLASS,
  HEADER_BRAND_CLASS,
  HEADER_MOBILE_CLASS,
  HEADER_NAV_CLASS,
  HEADER_SEARCH_CLASS,
} from "@/components/navigation/header-shell";
import { MobileNav } from "@/components/navigation/mobile-nav";
import { NavItemLabel, NavLink } from "@/components/navigation/nav-link";
import { Button } from "@/components/ui/button";
import { AUTH_NAV, PUBLIC_NAV } from "@/lib/constants";

export function SiteHeader({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className={HEADER_BAR_CLASS}>
      <div className={HEADER_BAR_INNER_CLASS}>
        <BrandMark href="/" priority className={HEADER_BRAND_CLASS} />
        <HeaderSearch
          path="/deals"
          idPrefix="site-header"
          className={HEADER_SEARCH_CLASS}
        />
        <nav className={HEADER_NAV_CLASS} aria-label="Primary">
          {PUBLIC_NAV.map((item) => (
            <NavLink key={item.href} href={item.href} tone="bar">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={HEADER_ACTIONS_CLASS}>
          {isAuthenticated ? (
            <>
              <NavLink href="/app" tone="bar">
                Workspace
              </NavLink>
              <SignOutButton />
            </>
          ) : (
            <>
              <NavLink href={AUTH_NAV[0].href} tone="bar">
                {AUTH_NAV[0].label}
              </NavLink>
              <Button asChild className="rounded-full px-4">
                <Link href={AUTH_NAV[1].href}>{AUTH_NAV[1].label}</Link>
              </Button>
            </>
          )}
        </div>
        <div className={HEADER_MOBILE_CLASS}>
          <MobileNav
            title="Menu"
            description="Public navigation"
            footer={
              isAuthenticated ? (
                <SignOutButton />
              ) : (
                <Button asChild className="w-full rounded-full">
                  <Link href={AUTH_NAV[1].href}>{AUTH_NAV[1].label}</Link>
                </Button>
              )
            }
          >
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
              <NavLink href={AUTH_NAV[0].href} className="w-full">
                <NavItemLabel item={AUTH_NAV[0]} />
              </NavLink>
            )}
          </MobileNav>
        </div>
      </div>
    </header>
  );
}
