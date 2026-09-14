import { EmailVerificationBanner } from "@/components/account/email-verification-banner";
import { AppHeader } from "@/components/navigation/app-header";
import { isAdminRole } from "@/lib/auth/roles";
import type { AppProfile } from "@/lib/auth/types";
import type { ReactNode } from "react";

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
      <div className="sticky top-0 z-40">
        <EmailVerificationBanner verified={emailVerified} />
        <AppHeader isAdmin={isAdminRole(profile.role)} />
      </div>
      {children}
    </div>
  );
}
