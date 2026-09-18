"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signUpAction } from "@/lib/auth/actions";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import { FormStatus } from "@/components/auth/form-status";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SignupForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState(
    signUpAction,
    INITIAL_ACTION_STATE,
  );

  return (
    <div className="flex flex-col gap-4">
      <GoogleSignInButton nextPath={nextPath} />
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={nextPath} />
        <Field id="displayName" label="Display name">
          <Input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            maxLength={80}
          />
        </Field>
        <Field id="email" label="Email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </Field>
        <Field id="password" label="Password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Field id="confirmPassword" label="Confirm password">
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
          {pending ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
