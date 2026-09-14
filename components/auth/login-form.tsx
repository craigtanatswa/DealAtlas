"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signInAction } from "@/lib/auth/actions";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({
  nextPath,
  initialError,
}: {
  nextPath: string;
  initialError?: string | null;
}) {
  const [state, action, pending] = useActionState(signInAction, {
    ...INITIAL_ACTION_STATE,
    error: initialError ?? null,
  });

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={nextPath} />
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
          autoComplete="current-password"
          required
        />
      </Field>
      <FormStatus error={state.error} success={state.success} />
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-sm text-muted-foreground">
        <Link href="/forgot-password" className="underline-offset-4 hover:underline">
          Forgot password?
        </Link>
      </p>
      <p className="text-sm text-muted-foreground">
        No account yet?{" "}
        <Link href="/signup" className="underline-offset-4 hover:underline">
          Get started
        </Link>
      </p>
    </form>
  );
}
