"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useAnalyticsConsent } from "@/hooks/use-analytics-consent";
import {
  recordGuideCtaClick,
  recordLanding,
  recordPageView,
} from "@/lib/analytics/attribution";
import { isAutomationTraffic } from "@/lib/analytics/bot";
import { buildPostHogClientConfig } from "@/lib/analytics/config";
import { registerAnalyticsOptOutHandler } from "@/lib/analytics/consent";
import { isCheckoutAnalyticsPlan } from "@/lib/analytics/events";
import {
  guideCtaClickProperties,
  guideCtaViewProperties,
} from "@/lib/analytics/guide-cta";
import { startGuideCtaViewTracking } from "@/lib/analytics/guide-cta-views";
import { isAnalyticsUuid } from "@/lib/analytics/sanitize";

type PostHogClient = (typeof import("posthog-js/dist/module.slim.no-external"))["default"];

let clientPromise: Promise<PostHogClient | null> | null = null;
let loadedClient: PostHogClient | null = null;
const clientListeners = new Set<() => void>();

function loadClient(apiKey: string): Promise<PostHogClient | null> {
  if (!clientPromise) {
    // Never initialise or capture from headless/bot traffic: the SDK is not
    // even imported, so automation cannot create a PostHog session.
    if (
      typeof navigator !== "undefined" &&
      isAutomationTraffic({ userAgent: navigator.userAgent, webdriver: navigator.webdriver })
    ) {
      return Promise.resolve(null);
    }
    clientPromise = import("posthog-js/dist/module.slim.no-external")
      .then(({ default: posthog }) => {
        posthog.init(apiKey, buildPostHogClientConfig(window.location.origin));
        loadedClient = posthog;
        for (const listener of [...clientListeners]) {
          listener();
        }
        return posthog;
      })
      .catch(() => null);
  }
  return clientPromise;
}

/**
 * The loaded SDK's anonymous distinct id. Never initialises the SDK and never
 * identifies the user; returns null until PostHog is actually loaded.
 */
export function getAnalyticsDistinctId(): string | null {
  try {
    const id = loadedClient?.get_distinct_id();
    return isAnalyticsUuid(id) ? id : null;
  } catch {
    return null;
  }
}

/** Notifies when the SDK has finished loading, so forms can pick up the id. */
export function subscribeToAnalyticsClient(listener: () => void): () => void {
  clientListeners.add(listener);
  return () => {
    clientListeners.delete(listener);
  };
}

const CHECKOUT_ACTION_PATH = "/api/billing/checkout";

function checkoutPlanFromSubmit(event: SubmitEvent): string | null {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return null;
  }
  let actionPath: string;
  try {
    actionPath = new URL(form.action, window.location.href).pathname;
  } catch {
    return null;
  }
  if (actionPath !== CHECKOUT_ACTION_PATH) {
    return null;
  }
  const plan = form.dataset.analyticsPlan;
  return isCheckoutAnalyticsPlan(plan) ? plan : null;
}

/**
 * PostHog for dealatlas.uk. Rendered only when NEXT_PUBLIC_POSTHOG_KEY is set;
 * without it nothing is loaded and nothing is sent. Every event passes the
 * fail-closed before_send allowlist (lib/analytics/sanitize.ts).
 */
export function PostHogAnalytics({ apiKey }: { apiKey: string }) {
  const pathname = usePathname();
  const consented = useAnalyticsConsent();

  useEffect(
    () =>
      registerAnalyticsOptOutHandler(() => {
        void clientPromise?.then((posthog) => posthog?.opt_out_capturing());
      }),
    [],
  );

  useEffect(() => {
    if (!consented) {
      return;
    }
    void clientPromise?.then((posthog) => posthog?.opt_in_capturing());
  }, [consented]);

  useEffect(() => {
    if (!consented) {
      return;
    }
    recordLanding({
      href: window.location.href,
      referrer: document.referrer,
      origin: window.location.origin,
    });

    const onSubmit = (event: SubmitEvent) => {
      const plan = checkoutPlanFromSubmit(event);
      if (!plan) {
        return;
      }
      void loadClient(apiKey).then((posthog) => {
        posthog?.capture(
          "pro_checkout_started",
          { plan, source_path: window.location.pathname },
          { send_instantly: true },
        );
      });
    };
    const onClick = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const properties = guideCtaClickProperties(element, window.location.pathname);
      if (!properties) {
        return;
      }
      recordGuideCtaClick(properties.cta_position, properties.cta_target);
      void loadClient(apiKey).then((posthog) => {
        posthog?.capture("guide_cta_clicked", properties, { send_instantly: true });
      });
    };
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [apiKey, consented]);

  useEffect(() => {
    if (!consented) {
      return;
    }
    recordPageView(pathname);
    void loadClient(apiKey).then((posthog) => {
      posthog?.capture("$pageview");
    });
  }, [apiKey, consented, pathname]);

  useEffect(() => {
    if (!consented || typeof IntersectionObserver === "undefined") {
      return;
    }
    return startGuideCtaViewTracking(pathname, (element) => {
      const properties = guideCtaViewProperties(element, pathname);
      if (!properties) {
        return;
      }
      void loadClient(apiKey).then((posthog) => {
        posthog?.capture("guide_cta_viewed", properties, { send_instantly: true });
      });
    });
  }, [apiKey, consented, pathname]);

  return null;
}