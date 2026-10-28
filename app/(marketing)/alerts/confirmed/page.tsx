import type { Metadata } from "next";

import { Main } from "@/components/layout/container";

export const metadata: Metadata = {
  title: "Alerts confirmed",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AlertsConfirmedPage({ searchParams }: PageProps) {
  const status = (await searchParams).status;
  const invalid = status === "invalid";
  return (
    <Main>
      <h1>{invalid ? "Confirmation link invalid" : "Alerts confirmed"}</h1>
      <p>
        {invalid
          ? "That confirmation link is invalid or has expired. You can request a new alert signup from any deal page."
          : "Your email alerts are confirmed. We will only email sanitised opportunity previews."}
      </p>
    </Main>
  );
}
