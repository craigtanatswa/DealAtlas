"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { BrandLogo } from "@/components/navigation/brand-mark";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SIGNUP_PROMPT_DELAY_MS,
  SIGNUP_PROMPT_STORAGE_KEY,
  accumulateVisibleTime,
  parseSignupPromptState,
  shouldOpenSignupPrompt,
  type SignupPromptState,
} from "@/lib/conversion/signup-prompt";

function readState(): SignupPromptState {
  return parseSignupPromptState(sessionStorage.getItem(SIGNUP_PROMPT_STORAGE_KEY));
}

function writeState(state: SignupPromptState) {
  sessionStorage.setItem(SIGNUP_PROMPT_STORAGE_KEY, JSON.stringify(state));
}

function isAutomatedBrowser() {
  return typeof navigator !== "undefined" && Boolean(navigator.webdriver);
}

export function SignupPrompt({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<SignupPromptState>({
    elapsedMs: 0,
    dismissed: false,
  });

  useEffect(() => {
    if (!enabled || isAutomatedBrowser()) {
      return;
    }

    let current = readState();
    let lastTick = Date.now();
    let timer: number | undefined;

    const syncId = window.setTimeout(() => {
      setState(current);
      if (current.dismissed || shouldOpenSignupPrompt(current)) {
        return;
      }

      timer = window.setInterval(() => {
        const now = Date.now();
        const delta = now - lastTick;
        lastTick = now;
        current = accumulateVisibleTime(
          current,
          delta,
          document.visibilityState === "visible",
        );
        writeState(current);
        setState(current);
        if (shouldOpenSignupPrompt(current)) {
          window.clearInterval(timer);
        }
      }, 1000);
    }, 0);

    return () => {
      window.clearTimeout(syncId);
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
    };
  }, [enabled]);

  function dismiss() {
    const next = {
      elapsedMs: Math.max(state.elapsedMs, SIGNUP_PROMPT_DELAY_MS),
      dismissed: true,
    };
    writeState(next);
    setState(next);
  }

  if (!enabled) {
    return null;
  }

  const open = shouldOpenSignupPrompt(state) && !isAutomatedBrowser();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          dismiss();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <BrandLogo className="h-9 w-auto md:h-10" />
          <DialogTitle className="text-xl leading-snug">
            Create a free account to keep going
          </DialogTitle>
          <DialogDescription>
            You can keep browsing without signing in. An account lets you save
            opportunities, set alerts, and unlock source details when a deal is
            worth pursuing.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col bg-transparent sm:flex-row sm:justify-start">
          <Button asChild>
            <Link href="/signup" onClick={dismiss}>
              Create account
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login" onClick={dismiss}>
              Sign in
            </Link>
          </Button>
          <Button type="button" variant="ghost" onClick={dismiss}>
            Continue browsing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
