import Link from "next/link";
import type { ReactNode } from "react";

import { EmailVerificationBanner } from "@/components/account/email-verification-banner";
import { SignOutButton } from "@/components/account/sign-out-button";
import { APP_NAME, APP_NAV } from "@/lib/constants";
import { isAdminRole } from "@/lib/auth/roles";
import type { AppProfile } from "@/lib/auth/types";

export function AppShell({
  profile,
  emailVerified,
  children,
}: {
  profile: AppProfile;
  emailVerified: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <EmailVerificationBanner verified={emailVerified} />
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/app" className="text-sm font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            {APP_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            {isAdminRole(profile.role) ? (
              <Link
                href="/admin"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Admin
              </Link>
            ) : null}
            <SignOutButton />
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
