"use client";

import { useActionState } from "react";
import Link from "next/link";

import { DealCard } from "@/components/deals/deal-card";
import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import { INITIAL_ACTION_STATE } from "@/lib/auth/messages";
import { appDealPath } from "@/lib/deals/paths";
import { toDealCardData } from "@/lib/search/dto";
import { unsaveDealAction } from "@/lib/saves/actions";
import type { SavedDealView } from "@/lib/saves/types";

export function SavedDealList({ items }: { items: SavedDealView[] }) {
  return (
    <ul className="grid gap-4">
      {items.map((item) => (
        <li key={item.id}>
          <SavedDealItem item={item} />
        </li>
      ))}
    </ul>
  );
}

function SavedDealItem({ item }: { item: SavedDealView }) {
  const [state, action, pending] = useActionState(
    unsaveDealAction,
    INITIAL_ACTION_STATE,
  );
  const href = appDealPath(item.dealId);

  return (
    <div className="flex flex-col gap-3">
      {item.preview ? (
        <DealCard deal={toDealCardData(item.preview)} href={href} />
      ) : (
        <article className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-heading text-lg font-semibold">Saved opportunity</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The sanitised preview is not published. Open the opportunity from your
            workspace to check its current status.
          </p>
          <Button asChild className="mt-4">
            <Link href={href}>Open opportunity</Link>
          </Button>
        </article>
      )}
      <form action={action}>
        <input type="hidden" name="dealId" value={item.dealId} />
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          {pending ? "Removing…" : "Unsave"}
        </Button>
        <FormStatus error={state.error} success={state.success} />
      </form>
    </div>
  );
}
