import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { isEmailVerified, requireUser } from "@/lib/auth/session";

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
