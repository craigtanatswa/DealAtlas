"use client";

import { useActionState } from "react";
import Link from "next/link";

import { AnalyticsAttributionFields } from "@/components/analytics/attribution-fields";
import { signUpAction } from "@/lib/auth/actions";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import { loginPathForPlan, loginPathWithNext } from "@/lib/auth/redirect";
import type { CheckoutPlanKey } from "@/lib/billing/types";
import { FormStatus } from "@/components/auth/form-status";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SignupForm({
  nextPath,
  plan,
  analyticsEnabled = false,
}: {
  nextPath: string;
  plan: CheckoutPlanKey | null;
  analyticsEnabled?: boolean;
}) {
  const [state, action, pending] = useActionState(
    signUpAction,
    INITIAL_ACTION_STATE,
  );

  return (
    <div className="flex flex-col gap-4">
      <GoogleSignInButton nextPath={nextPath} />
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={nextPath} />
        <AnalyticsAttributionFields enabled={analyticsEnabled} />
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
          <Link
            href={plan ? loginPathForPlan(plan) : loginPathWithNext(nextPath)}
            className="underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
