"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, Loader2Icon } from "lucide-react";

const POLL_MS = 2000;
const TIMEOUT_MS = 60_000;

export function UpgradeStatusBanner({ initialPro }: { initialPro: boolean }) {
  const router = useRouter();
  const [pro, setPro] = useState(initialPro);
  const [timedOut, setTimedOut] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (pro) {
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
        const body = (await response.json()) as { plan?: string };
        if (!cancelled && body.plan === "PRO") {
          setPro(true);
          router.refresh();
        }
      } catch {
        // Ignore errors; keep waiting for the verified entitlement.
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
  }, [pro, round, router]);

  if (pro) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
          <CheckIcon className="size-3.5" aria-hidden="true" />
        </span>
        <p>
          <strong className="font-semibold">Pro is active.</strong> Full details
          for this opportunity are now unlocked.
        </p>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
      >
        <p>
          <strong className="font-semibold">Still confirming your payment.</strong>{" "}
          This can take a minute.
        </p>
        <button
          type="button"
          className="font-medium underline underline-offset-2"
          onClick={() => {
            setTimedOut(false);
            setRound((value) => value + 1);
            router.refresh();
          }}
        >
          Refresh status
        </button>
        <Link href="/app/billing" className="font-medium underline underline-offset-2">
          Open billing
        </Link>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
    >
      <Loader2Icon
        className="size-4 shrink-0 animate-spin text-blue-600"
        aria-hidden="true"
      />
      <p>
        <strong className="font-semibold">Confirming your payment…</strong> This
        page will update automatically. Details stay locked until your payment is
        confirmed. You don&apos;t need to pay again.
      </p>
    </div>
  );
}
