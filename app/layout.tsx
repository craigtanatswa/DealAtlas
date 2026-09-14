import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { SkipLink } from "@/components/layout/skip-link";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

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

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en-GB"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
