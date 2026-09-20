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
  HEADER_NAV_APP_CLASS,
  HEADER_SEARCH_APP_CLASS,
} from "@/components/navigation/header-shell";
import { MobileNav } from "@/components/navigation/mobile-nav";
import { NavItemLabel, NavLink } from "@/components/navigation/nav-link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACCOUNT_NAV, APP_NAV } from "@/lib/constants";

export function AppHeader({ isAdmin }: { isAdmin: boolean }) {
  return (
    <header className={HEADER_BAR_CLASS}>
      <div className={HEADER_BAR_INNER_CLASS}>
        <BrandMark href="/app" priority className={HEADER_BRAND_CLASS} />
        <HeaderSearch
          path="/app/search"
          idPrefix="app-header"
          className={HEADER_SEARCH_APP_CLASS}
        />
        <nav className={HEADER_NAV_APP_CLASS} aria-label="Workspace">
          {APP_NAV.map((item) => (
            <NavLink key={item.href} href={item.href} tone="bar">
              <NavItemLabel item={item} />
            </NavLink>
          ))}
          {isAdmin ? (
            <NavLink href="/admin" end tone="bar">
              Admin
            </NavLink>
          ) : null}
        </nav>
        <div className={HEADER_ACTIONS_CLASS}>
          <AccountMenu />
        </div>
        <div className={HEADER_MOBILE_CLASS}>
          <MobileNav title="Workspace" description="Authenticated navigation">
            {APP_NAV.map((item) => (
              <NavLink key={item.href} href={item.href} className="w-full">
                <NavItemLabel item={item} />
              </NavLink>
            ))}
            {ACCOUNT_NAV.map((item) => (
              <NavLink key={item.href} href={item.href} className="w-full">
                {item.label}
              </NavLink>
            ))}
            {isAdmin ? (
              <NavLink href="/admin" className="w-full" end>
                Admin
              </NavLink>
            ) : null}
            <div className="pt-2">
              <SignOutButton />
            </div>
          </MobileNav>
        </div>
      </div>
    </header>
  );
}

function AccountMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="rounded-full px-4">
          Account
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>Billing and account</DropdownMenuLabel>
        {ACCOUNT_NAV.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-1.5 py-1">
          <SignOutButton />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
