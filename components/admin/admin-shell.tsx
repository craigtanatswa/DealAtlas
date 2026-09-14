import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/account/sign-out-button";
import { ADMIN_NAV, APP_NAME } from "@/lib/constants";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/admin" className="text-sm font-semibold tracking-tight">
            {APP_NAME} Admin
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/app"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Workspace
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
