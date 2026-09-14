"use client";

import { useActionState } from "react";

import { updateDisplayNameAction } from "@/lib/auth/actions";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import type { AppProfile } from "@/lib/auth/types";
import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({
  profile,
  emailVerified,
}: {
  profile: AppProfile;
  emailVerified: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateDisplayNameAction,
    INITIAL_ACTION_STATE,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={profile.email} readOnly disabled />
        <p className="text-xs text-muted-foreground">
          {emailVerified ? "Email confirmed." : "Email not confirmed yet."}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          maxLength={80}
          defaultValue={profile.display_name ?? ""}
        />
      </div>
      <FormStatus error={state.error} success={state.success} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save display name"}
        </Button>
      </div>
    </form>
  );
}
