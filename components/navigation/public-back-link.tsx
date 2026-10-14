"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

const STACK_KEY = "dealatlas:public-path-stack";

/** Deal detail returns to the list. Every other public sub page returns home. */
export function publicBackFallback(pathname: string): string {
  if (/^\/deals\/[^/]+\/?$/.test(pathname)) {
    return "/deals";
  }
  return "/";
}

function readStack(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-40)));
}

export function hasSameSiteHistory(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const referrer = document.referrer;
    const sameSite =
      referrer.length > 0 && new URL(referrer).origin === window.location.origin;
    if (sameSite && window.history.length > 1) {
      return true;
    }
  } catch {
    // A malformed referrer falls through to the in-app path stack.
  }
  return readStack().length > 1;
}

/** Records in-app navigations so Back can return to the previous same-site page. */
export function PublicNavigationMemory() {
  const pathname = usePathname();

  useEffect(() => {
    const onPop = () => {
      const stack = readStack();
      if (stack.length > 1) {
        stack.pop();
        writeStack(stack);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const stack = readStack();
    if (stack[stack.length - 1] !== pathname) {
      stack.push(pathname);
      writeStack(stack);
    }
  }, [pathname]);

  return null;
}

export function PublicBackLink({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/";
  const href = publicBackFallback(pathname);

  return (
    <Link
      href={href}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        if (hasSameSiteHistory()) {
          event.preventDefault();
          window.history.back();
        }
      }}
      className={cn(
        "inline-flex min-h-11 items-center self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      ← Back
    </Link>
  );
}
