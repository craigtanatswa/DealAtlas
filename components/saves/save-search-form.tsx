"use client";

import { useActionState } from "react";

import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import { ALERT_CADENCES } from "@/lib/saves/filters";
import { saveSearchAction } from "@/lib/saves/actions";
import type { SignedInSearchFilters } from "@/lib/search/params";
import { QUOTA_ERROR_COPY } from "@/lib/quotas";
import { quotaLabel } from "@/lib/quotas";

const CADENCE_LABELS: Record<(typeof ALERT_CADENCES)[number], string> = {
  NONE: "No alerts",
  IMMEDIATE: "Immediate alerts",
  DAILY: "Daily alerts",
  WEEKLY: "Weekly alerts",
};

export function SaveSearchForm({
  filters,
  used,
  limit,
  emailVerified,
}: {
  filters: SignedInSearchFilters;
  used: number;
  limit: number | null;
  emailVerified: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveSearchAction,
    INITIAL_ACTION_STATE,
  );
  const atLimit = limit !== null && used >= limit;

  if (!emailVerified) {
    return (
      <p className="text-sm text-muted-foreground">
        Confirm your email before saving searches and alerts.
      </p>
    );
  }

  if (atLimit) {
    return (
      <p className="text-sm text-muted-foreground">
        {limit === 1 ? QUOTA_ERROR_COPY.savedSearches : `Saved search limit reached (${quotaLabel(used, limit)}).`}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <input type="hidden" name="q" value={filters.query ?? ""} />
      <input type="hidden" name="category" value={filters.category ?? ""} />
      <input type="hidden" name="buyerSector" value={filters.buyerSector ?? ""} />
      <input type="hidden" name="region" value={filters.region ?? ""} />
      <input type="hidden" name="valueBand" value={filters.valueBand ?? ""} />
      <input type="hidden" name="deadlineBand" value={filters.deadlineBand ?? ""} />
      <input type="hidden" name="dealType" value={filters.dealType ?? ""} />
      <input type="hidden" name="status" value={filters.status ?? ""} />
      <input type="hidden" name="sort" value={filters.sort ?? ""} />
      <input type="hidden" name="minScore" value={filters.minScore ?? ""} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="saved-search-name">Save this search</Label>
        <Input
          id="saved-search-name"
          name="name"
          required
          maxLength={80}
          placeholder="e.g. London technology closing soon"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="saved-search-cadence">Alert cadence</Label>
        <NativeSelect id="saved-search-cadence" name="alertCadence" defaultValue="WEEKLY">
          {ALERT_CADENCES.map((cadence) => (
            <option key={cadence} value={cadence}>
              {CADENCE_LABELS[cadence]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save search"}
        </Button>
        <p className="text-sm text-muted-foreground">{quotaLabel(used, limit)}</p>
      </div>
      <FormStatus error={state.error} success={state.success} />
    </form>
  );
}
