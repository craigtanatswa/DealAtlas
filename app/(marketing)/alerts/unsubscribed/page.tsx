import type { Metadata } from "next";

import { Main } from "@/components/layout/container";

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false, follow: false },
};

export default function AlertsUnsubscribedPage() {
  return (
    <Main>
      <h1>Unsubscribed</h1>
      <p>You have been unsubscribed from DealAtlas email alerts.</p>
    </Main>
  );
}
