"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function HomeTeaserBand({ onDismiss }: { onDismiss?: () => void }) {
  const [open, setOpen] = useState(true);
  if (!open) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[0.9375rem] leading-6 text-foreground">
        Create a free account to open a deal.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="min-h-11 w-full sm:w-auto">
          <Link href="/signup">Create free account</Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full md:hidden"
          onClick={() => {
            setOpen(false);
            onDismiss?.();
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function HomeTeaserSticky({ sentinelId }: { sentinelId: string }) {
  const [past, setPast] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const sentinel = document.getElementById(sentinelId);
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelId]);

  if (!open || !past) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-4 py-3">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">Create a free account to open a deal.</p>
        <div className="flex gap-2">
          <Button asChild className="min-h-11 flex-1 sm:flex-none">
            <Link href="/signup">Create free account</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 min-w-11 md:hidden"
            onClick={() => setOpen(false)}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
