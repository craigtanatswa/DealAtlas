"use client";

import { useActionState, type ReactNode } from "react";

import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/auth/messages";

export function AdminActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Working…",
  variant = "outline",
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant={variant} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        <FormStatus error={state.error} success={state.success} />
      </div>
    </form>
  );
}
