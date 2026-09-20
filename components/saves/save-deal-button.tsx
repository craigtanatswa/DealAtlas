"use client";

import { useActionState } from "react";
import Link from "next/link";

import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import { saveDealAction, unsaveDealAction } from "@/lib/saves/actions";
import { quotaLabel } from "@/lib/quotas";
import { QUOTA_ERROR_COPY } from "@/lib/quotas";

export function SaveDealButton({
  dealId,
  saved,
  used,
  limit,
  signedIn,
  loginHref,
}: {
  dealId: string;
  saved: boolean;
  used: number;
  limit: number | null;
  signedIn: boolean;
  loginHref?: string;
}) {
  const action = saved ? unsaveDealAction : saveDealAction;
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const atLimit = !saved && limit !== null && used >= limit;

  if (!signedIn) {
    return (
      <Button asChild variant="outline">
        <Link href={loginHref ?? "/login"}>Sign in to save</Link>
      </Button>
    );
  }

  if (atLimit) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{QUOTA_ERROR_COPY.savedDeals}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/pricing">Upgrade to Pro</Link>
          </Button>
          <p className="self-center text-sm text-muted-foreground tabular-nums">
            {quotaLabel(used, limit)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="dealId" value={dealId} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={saved ? "outline" : "default"} disabled={pending}>
          {pending ? "Saving…" : saved ? "Unsave" : "Save opportunity"}
        </Button>
        <p className="text-sm text-muted-foreground tabular-nums">{quotaLabel(used, limit)}</p>
      </div>
      <FormStatus error={state.error} success={state.success} />
    </form>
  );
}
