"use client";

import { Inter, Geist_Mono } from "next/font/google";

import { ErrorState } from "@/components/feedback/empty-state";
import { Main } from "@/components/layout/container";
import { APP_NAME } from "@/lib/constants";

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

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("DealAtlas global error", error.digest ?? error.name);

  return (
    <html
      lang="en-GB"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Main className="gap-8">
          {/* next/image can fail in the last-resort error shell; use the static asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/dealatlas-logo.png"
            alt={APP_NAME}
            width={180}
            height={60}
            className="h-8 w-auto"
          />
          <ErrorState
            title="Application error"
            description="DealAtlas could not finish loading. Try again in a moment."
            onRetry={reset}
          />
        </Main>
      </body>
    </html>
  );
}
