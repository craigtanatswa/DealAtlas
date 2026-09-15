"use client";

import { useActionState } from "react";

import { AlertArticle } from "@/components/alerts/alert-article";
import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import { markAlertReadAction } from "@/lib/alerts/actions";
import type { AlertCentreDto, AlertDto } from "@/lib/alerts/types";

export function AlertCentre({ centre }: { centre: AlertCentreDto }) {
  if (centre.items.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-4">
      {centre.items.map((alert) => (
        <li key={alert.id}>
          <AlertItem alert={alert} plan={centre.plan} />
        </li>
      ))}
    </ul>
  );
}

function AlertItem({
  alert,
  plan,
}: {
  alert: AlertDto;
  plan: AlertCentreDto["plan"];
}) {
  const [state, action, pending] = useActionState(
    markAlertReadAction,
    INITIAL_ACTION_STATE,
  );

  return (
    <div className="flex flex-col gap-2">
      <AlertArticle
        alert={alert}
        plan={plan}
        actions={
          alert.status === "UNREAD" ? (
            <form action={action}>
              <input type="hidden" name="alertId" value={alert.id} />
              <input type="hidden" name="status" value="READ" />
              <Button type="submit" variant="ghost" size="sm" disabled={pending}>
                {pending ? "Updating…" : "Mark read"}
              </Button>
            </form>
          ) : null
        }
      />
      <FormStatus error={state.error} success={state.success} />
    </div>
  );
}
