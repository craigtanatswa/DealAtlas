import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Workspace",
};

export default async function AppHomePage() {
  const { profile } = await requireUser("/app");
  const firstName = profile.display_name?.split(" ")[0] ?? "there";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Welcome, {firstName}
      </h1>
      <p className="max-w-2xl text-base leading-7 text-muted-foreground">
        Your workspace is ready. Complete your company profile so DealAtlas can
        match opportunities when search and scoring go live.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/app/profile">Account and company profile</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/deals">Browse public deals</Link>
        </Button>
      </div>
    </main>
  );
}
