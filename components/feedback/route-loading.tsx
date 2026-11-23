"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";

import { PageLoadingState } from "@/components/feedback/loading-state";

export const ROUTE_LOADING_SHOW_DELAY_MS = 150;
export const ROUTE_LOADING_SETTLE_TIMEOUT_MS = 8_000;

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

function pathAndSearch(href: string = window.location.href): string {
  const url = new URL(href);
  return `${url.pathname}${url.search}`;
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

function RouteLoadingTriggers({
  onStart,
  onSettle,
  lastPathSearchRef,
}: {
  onStart: () => void;
  onSettle: () => void;
  lastPathSearchRef: MutableRefObject<string | null>;
}) {
  useEffect(() => {
    if (lastPathSearchRef.current === null) {
      lastPathSearchRef.current = pathAndSearch();
    }

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
      const next = pathAndSearch();
      if (next === lastPathSearchRef.current) {
        return;
      }
      lastPathSearchRef.current = next;
      onStart();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        onSettle();
      }
    };

    // Bubble phase: anchors that preventDefault in onClick must be seen
    // after that, or the loader starts and never clears.
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [lastPathSearchRef, onSettle, onStart]);

  return null;
}

export function RouteLoadingSlot({ children }: { children: ReactNode }) {
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const lastPathSearchRef = useRef<string | null>(null);
  const start = useCallback(() => setPendingSince(Date.now()), []);
  const settle = useCallback(() => {
    if (typeof window !== "undefined") {
      lastPathSearchRef.current = pathAndSearch();
    }
    setPendingSince(null);
  }, []);

  useEffect(() => {
    if (pendingSince === null) {
      return;
    }

    const showTimer = window.setTimeout(
      () => setReadyAt(pendingSince),
      ROUTE_LOADING_SHOW_DELAY_MS,
    );
    const capTimer = window.setTimeout(settle, ROUTE_LOADING_SETTLE_TIMEOUT_MS);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(capTimer);
    };
  }, [pendingSince, settle]);

  const show = pendingSince !== null && readyAt === pendingSince;

  return (
    <>
      <Suspense fallback={null}>
        <RouteChangeClear onSettled={settle} />
      </Suspense>
      <RouteLoadingTriggers
        onStart={start}
        onSettle={settle}
        lastPathSearchRef={lastPathSearchRef}
      />
      {show ? <PageLoadingState label="Loading" /> : children}
    </>
  );
}
