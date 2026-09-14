"use client";

import { useActionState } from "react";
import Link from "next/link";

import { forgotPasswordAction } from "@/lib/auth/actions";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    forgotPasswordAction,
    INITIAL_ACTION_STATE,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id="email" label="Email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </Field>
      <FormStatus error={state.error} success={state.success} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
