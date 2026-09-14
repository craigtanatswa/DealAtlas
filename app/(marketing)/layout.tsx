import type { ReactNode } from "react";

import { SiteFooter } from "@/components/navigation/site-footer";
import { SiteHeader } from "@/components/navigation/site-header";
import { getAuthUser } from "@/lib/auth/session";

export default async function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getAuthUser();

  return (
    <>
      <SiteHeader isAuthenticated={Boolean(user)} />
      {children}
      <SiteFooter />
    </>
  );
}
