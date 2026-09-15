"use client";

import { useActionState } from "react";

import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import { saveNotificationPreferencesAction } from "@/lib/alerts/actions";
import { DIGEST_CADENCES, type NotificationPreferences } from "@/lib/alerts/types";

export function NotificationPreferencesForm({
  preferences,
  emailVerified,
}: {
  preferences: NotificationPreferences;
  emailVerified: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveNotificationPreferencesAction,
    INITIAL_ACTION_STATE,
  );

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="emailEnabled"
          value="true"
          defaultChecked={preferences.emailEnabled}
          disabled={!emailVerified}
        />
        Email digest
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="newMatchEnabled"
          value="true"
          defaultChecked={preferences.newMatchEnabled}
        />
        New match alerts
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="dealChangeEnabled"
          value="true"
          defaultChecked={preferences.dealChangeEnabled}
        />
        Saved opportunity change alerts
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="deadlineEnabled"
          value="true"
          defaultChecked={preferences.deadlineEnabled}
        />
        Deadline alerts
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="renewalEnabled"
          value="true"
          defaultChecked={preferences.renewalEnabled}
        />
        Renewal alerts
      </label>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="digest-cadence">Digest cadence</Label>
        <NativeSelect
          id="digest-cadence"
          name="digestCadence"
          defaultValue={preferences.digestCadence}
        >
          {DIGEST_CADENCES.map((cadence) => (
            <option key={cadence} value={cadence}>
              {cadence === "IMMEDIATE"
                ? "After each evaluation"
                : cadence === "DAILY"
                  ? "Daily"
                  : "Weekly"}
            </option>
          ))}
        </NativeSelect>
      </div>
      {!emailVerified ? (
        <p className="text-sm text-muted-foreground">
          Confirm your email before enabling email alerts. In-app alerts still work.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
      <FormStatus error={state.error} success={state.success} />
    </form>
  );
}
