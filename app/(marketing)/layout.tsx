import type { ReactNode } from "react";

import { SiteFooter } from "@/components/navigation/site-footer";
import { SiteHeader } from "@/components/navigation/site-header";
import { SignupPrompt } from "@/components/conversion/signup-prompt";
import { getAuthUser } from "@/lib/auth/session";

export default async function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getAuthUser();
  const isAuthenticated = Boolean(user);

  return (
    <>
      <SiteHeader isAuthenticated={isAuthenticated} />
      {children}
      <SiteFooter />
      <SignupPrompt enabled={!isAuthenticated} />
    </>
  );
}
