import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="max-w-2xl text-base leading-7 text-muted-foreground">
        Notification preferences and extra account controls will expand here.
        Display name and company matching details are on your profile.
      </p>
      <div>
        <Button asChild variant="outline">
          <Link href="/app/profile">Open profile</Link>
        </Button>
      </div>
    </main>
  );
}
