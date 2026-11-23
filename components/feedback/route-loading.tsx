"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { PageLoadingState } from "@/components/feedback/loading-state";

const SHOW_DELAY_MS = 150;

function sameDocumentUrl(next: URL, current: URL): boolean {
  return (
    next.origin === current.origin &&
    next.pathname === current.pathname &&
    next.search === current.search
  );
}

export function isInternalPathChange(href: string, currentHref: string): boolean {
  const current = new URL(currentHref);
  let next: URL;
  try {
    next = new URL(href, current.href);
  } catch {
    return false;
  }

  if (next.origin !== current.origin) {
    return false;
  }
  if (next.protocol !== "http:" && next.protocol !== "https:") {
    return false;
  }

  return !sameDocumentUrl(next, current);
}

function RouteChangeClear({ onSettled }: { onSettled: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    onSettled();
  }, [routeKey, onSettled]);

  return null;
}

function RouteLoadingTriggers({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement) || !anchor.href) {
        return;
      }
      if (anchor.target && anchor.target !== "_self") {
        return;
      }
      if (anchor.hasAttribute("download")) {
        return;
      }
      if (!isInternalPathChange(anchor.href, window.location.href)) {
        return;
      }

      onStart();
    };

    const onPopState = () => {
      onStart();
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [onStart]);

  return null;
}

export function RouteLoadingSlot({ children }: { children: ReactNode }) {
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const start = useCallback(() => setPendingSince(Date.now()), []);
  const settle = useCallback(() => setPendingSince(null), []);

  useEffect(() => {
    if (pendingSince === null) {
      return;
    }

    const timer = window.setTimeout(() => setReadyAt(pendingSince), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pendingSince]);

  const show = pendingSince !== null && readyAt === pendingSince;

  return (
    <>
      <Suspense fallback={null}>
        <RouteChangeClear onSettled={settle} />
      </Suspense>
      <RouteLoadingTriggers onStart={start} />
      {show ? <PageLoadingState label="Loading" /> : children}
    </>
  );
}
