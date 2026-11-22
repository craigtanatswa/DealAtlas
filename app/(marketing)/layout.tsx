import type { ReactNode } from "react";

import { SiteFooter } from "@/components/navigation/site-footer";
import { SiteHeader } from "@/components/navigation/site-header";
import { SignupPromptGate } from "@/components/conversion/signup-prompt-gate";
import { ViewerProvider } from "@/components/viewer/viewer-provider";

export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ViewerProvider>
      <SiteHeader />
      {children}
      <SiteFooter />
      <SignupPromptGate />
    </ViewerProvider>
  );
}
