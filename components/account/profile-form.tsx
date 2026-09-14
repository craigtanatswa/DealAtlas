"use client";

import { useActionState } from "react";

import { updateDisplayNameAction } from "@/lib/auth/actions";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import type { AppProfile } from "@/lib/auth/types";
import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
      <Field
        id="email"
        label="Email"
        hint={emailVerified ? "Email confirmed." : "Email not confirmed yet."}
      >
        <Input id="email" value={profile.email} readOnly disabled />
      </Field>
      <Field id="displayName" label="Display name">
        <Input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          maxLength={80}
          defaultValue={profile.display_name ?? ""}
        />
      </Field>
      <FormStatus error={state.error} success={state.success} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save display name"}
        </Button>
      </div>
    </form>
  );
}
