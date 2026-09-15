import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { SkipLink } from "@/components/layout/skip-link";
import { MeasurementScripts } from "@/components/seo/measurement-scripts";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";
import { getMeasurementConfig } from "@/lib/seo/analytics";
import { getPublicEnv } from "@/lib/env/public";

import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function buildRootMetadata(): Metadata {
  const env = getPublicEnv();
  const origin = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const measurement = getMeasurementConfig(env);

  return {
    metadataBase: new URL(`${origin}/`),
    title: {
      default: APP_NAME,
      template: `%s · ${APP_NAME}`,
    },
    description: APP_DESCRIPTION,
    applicationName: APP_NAME,
    verification: measurement.googleSiteVerification
      ? { google: measurement.googleSiteVerification }
      : undefined,
    openGraph: {
      type: "website",
      locale: "en_GB",
      siteName: APP_NAME,
      title: APP_NAME,
      description: APP_DESCRIPTION,
      url: origin,
    },
    twitter: {
      card: "summary",
      title: APP_NAME,
      description: APP_DESCRIPTION,
    },
  };
}

export const metadata: Metadata = buildRootMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const measurement = getMeasurementConfig(getPublicEnv());

  return (
    <html
      lang="en-GB"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <MeasurementScripts config={measurement} />
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
