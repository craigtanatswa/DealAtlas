"use client";

import { useActionState } from "react";
import Link from "next/link";

import { resetPasswordAction } from "@/lib/auth/actions";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ResetPasswordForm({ hasSession }: { hasSession: boolean }) {
  const [state, action, pending] = useActionState(
    resetPasswordAction,
    INITIAL_ACTION_STATE,
  );

  if (!hasSession) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm text-destructive">
          That reset link is invalid or has expired.
        </p>
        <p className="text-sm text-muted-foreground">
          <Link href="/forgot-password" className="underline-offset-4 hover:underline">
            Request a new reset link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id="password" label="New password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      <Field id="confirmPassword" label="Confirm new password">
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      <FormStatus error={state.error} success={state.success} />
      <Button type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
