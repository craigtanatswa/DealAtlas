"use client";

import { useActionState } from "react";
import Link from "next/link";

import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import {
  deleteSavedSearchAction,
  updateSavedSearchAction,
} from "@/lib/saves/actions";
import {
  ALERT_CADENCES,
  savedSearchHref,
  savedSearchSummary,
} from "@/lib/saves/filters";
import type { SavedSearchView } from "@/lib/saves/types";

const CADENCE_LABELS: Record<(typeof ALERT_CADENCES)[number], string> = {
  NONE: "No alerts",
  IMMEDIATE: "Immediate",
  DAILY: "Daily",
  WEEKLY: "Weekly",
};

export function SavedSearchList({ searches }: { searches: SavedSearchView[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {searches.map((search) => (
        <li key={search.id}>
          <SavedSearchItem
            key={`${search.id}:${search.name}:${search.alertCadence}:${search.enabled}`}
            search={search}
          />
        </li>
      ))}
    </ul>
  );
}

function SavedSearchItem({ search }: { search: SavedSearchView }) {
  const [updateState, updateAction, updatePending] = useActionState(
    updateSavedSearchAction,
    INITIAL_ACTION_STATE,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteSavedSearchAction,
    INITIAL_ACTION_STATE,
  );

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-lg font-semibold">{search.name}</h2>
        <p className="text-sm text-muted-foreground">
          {savedSearchSummary(search.filters)}
        </p>
      </div>
      <form action={updateAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={search.id} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`search-name-${search.id}`}>Name</Label>
          <Input
            id={`search-name-${search.id}`}
            name="name"
            defaultValue={search.name}
            required
            maxLength={80}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`search-cadence-${search.id}`}>Alert cadence</Label>
          <NativeSelect
            id={`search-cadence-${search.id}`}
            name="alertCadence"
            defaultValue={search.alertCadence}
          >
            {ALERT_CADENCES.map((cadence) => (
              <option key={cadence} value={cadence}>
                {CADENCE_LABELS[cadence]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={search.enabled}
            value="true"
          />
          Alerts enabled
        </label>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <Button type="submit" size="sm" disabled={updatePending}>
            {updatePending ? "Saving…" : "Update"}
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={savedSearchHref(search.filters)}>Run search</Link>
          </Button>
        </div>
        <FormStatus error={updateState.error} success={updateState.success} />
      </form>
      <form action={deleteAction}>
        <input type="hidden" name="id" value={search.id} />
        <Button type="submit" variant="ghost" size="sm" disabled={deletePending}>
          {deletePending ? "Removing…" : "Remove"}
        </Button>
        <FormStatus error={deleteState.error} success={deleteState.success} />
      </form>
    </article>
  );
}
