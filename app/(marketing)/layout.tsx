import type { ReactNode } from "react";
import Link from "next/link";

import { SignOutButton } from "@/components/account/sign-out-button";
import { APP_NAME, AUTH_NAV, PUBLIC_NAV } from "@/lib/constants";
import { getAuthUser } from "@/lib/auth/session";

export default async function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getAuthUser();

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link
                  href="/app"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Workspace
                </Link>
                <SignOutButton />
              </>
            ) : (
              AUTH_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))
            )}
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}
