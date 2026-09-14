"use client";

import Link from "next/link";

import { SignOutButton } from "@/components/account/sign-out-button";
import { BrandMark } from "@/components/navigation/brand-mark";
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
    <header className="border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[80rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandMark href="/app" />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Workspace">
          {APP_NAV.map((item) => (
            <NavLink key={item.href} href={item.href}>
              <NavItemLabel item={item} />
            </NavLink>
          ))}
          {isAdmin ? (
            <NavLink href="/admin" end>
              Admin
            </NavLink>
          ) : null}
          <AccountMenu />
        </nav>
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
    </header>
  );
}

function AccountMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
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
