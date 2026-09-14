"use client";

import { Geist, Geist_Mono } from "next/font/google";

import { Button } from "@/components/ui/button";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-16">
          <h1 className="text-3xl font-semibold tracking-tight">
            Application error
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            DealAtlas could not finish loading. Try again in a moment.
          </p>
          <div>
            <Button type="button" onClick={reset}>
              Try again
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
