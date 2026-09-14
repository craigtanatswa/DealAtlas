import type { Metadata } from "next";
import Link from "next/link";

import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <Main>
      <Heading>Settings</Heading>
      <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground md:text-base">
        Notification preferences and extra account controls will expand here.
        Display name and company matching details are on your profile.
      </p>
      <div>
        <Button asChild variant="outline">
          <Link href="/app/profile">Open profile</Link>
        </Button>
      </div>
    </Main>
  );
}
