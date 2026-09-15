import type { Metadata } from "next";
import Link from "next/link";

import { NotificationPreferencesForm } from "@/components/alerts/notification-preferences-form";
import { Heading } from "@/components/layout/heading";
import { Main } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadNotificationPreferences } from "@/lib/alerts/preferences";
import { isEmailVerified, requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const { user } = await requireUser("/app/settings");
  const supabase = await createSupabaseServerClient();
  const preferences = await loadNotificationPreferences(supabase, user.id);

  return (
    <Main className="gap-10">
      <div className="flex flex-col gap-2">
        <Heading>Settings</Heading>
        <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground md:text-base">
          Control which alerts DealAtlas generates and whether they are emailed.
          Display name and company matching details are on your profile.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold tracking-tight">
            Alert preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationPreferencesForm
            key={`${preferences.digestCadence}:${preferences.emailEnabled}:${preferences.newMatchEnabled}:${preferences.dealChangeEnabled}:${preferences.deadlineEnabled}:${preferences.renewalEnabled}`}
            preferences={preferences}
            emailVerified={isEmailVerified(user)}
          />
        </CardContent>
      </Card>
      <div>
        <Button asChild variant="outline">
          <Link href="/app/profile">Open profile</Link>
        </Button>
      </div>
    </Main>
  );
}
