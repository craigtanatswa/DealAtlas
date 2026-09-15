import type { ReactNode } from "react";
import type { Metadata } from "next";

import { AppShell } from "@/components/app/app-shell";
import { isEmailVerified, requireUser } from "@/lib/auth/session";
import { NOINDEX_ROBOTS } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export default async function AppShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, profile } = await requireUser("/app");

  return (
    <AppShell profile={profile} emailVerified={isEmailVerified(user)}>
      {children}
    </AppShell>
  );
}
