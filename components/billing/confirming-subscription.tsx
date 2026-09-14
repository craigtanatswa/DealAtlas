"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { isAppDealPath } from "@/lib/deals/paths";
import { PLANS } from "@/lib/constants";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";

const POLL_MS = 2000;
const TIMEOUT_MS = 60_000;

export function ConfirmingSubscription({
  initialEntitlement,
  afterConfirmHref = "/app",
}: {
  initialEntitlement: EntitlementSnapshot;
  afterConfirmHref?: string;
}) {
  const [entitlement, setEntitlement] = useState(initialEntitlement);
  const [timedOut, setTimedOut] = useState(false);

  const confirmed = entitlement.plan === PLANS.PRO;
  const revealDeal = isAppDealPath(afterConfirmHref);

  useEffect(() => {
    if (confirmed) {
      return;
    }

    const started = Date.now();
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/billing/entitlement", {
          cache: "no-store",
        });
        if (!response.ok || cancelled) {
          return;
        }
        const body = (await response.json()) as EntitlementSnapshot;
        if (!cancelled) {
          setEntitlement(body);
        }
      } catch {
        // Keep waiting; webhook confirmation is the source of truth.
      }
    }

    const interval = window.setInterval(() => {
      if (Date.now() - started >= TIMEOUT_MS) {
        setTimedOut(true);
        window.clearInterval(interval);
        return;
      }
      void poll();
    }, POLL_MS);

    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [confirmed]);

  if (confirmed) {
    return (
      <EmptyState
        title="Subscription confirmed"
        description="DealAtlas Pro is active. Protected source details stay hidden until this verified entitlement is present."
      >
        <Button asChild>
          <Link href={afterConfirmHref}>
            {revealDeal ? "Open opportunity details" : "Go to workspace"}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/app/billing">View billing</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <EmptyState
      kind="paymentConfirming"
      title={timedOut ? "Still confirming subscription" : undefined}
      description={
        timedOut
          ? "The checkout redirect is not proof of payment. Open billing to check again, or wait for the provider webhook to finish."
          : undefined
      }
    >
      <Button asChild variant="outline">
        <Link href="/app/billing">Open billing</Link>
      </Button>
    </EmptyState>
  );
}
