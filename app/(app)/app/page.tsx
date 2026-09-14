import type { Metadata } from "next";
import Link from "next/link";

import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Workspace",
};

export default async function AppHomePage() {
  const { profile } = await requireUser("/app");
  const firstName = profile.display_name?.split(" ")[0] ?? "there";

  return (
    <Main>
      <Heading>Welcome, {firstName}</Heading>
      <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground md:text-base">
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
    </Main>
  );
}
