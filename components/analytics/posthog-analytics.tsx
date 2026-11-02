"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useAnalyticsConsent } from "@/hooks/use-analytics-consent";
import {
  recordGuideCtaClick,
  recordLanding,
  recordPageView,
} from "@/lib/analytics/attribution";
import { buildPostHogClientConfig } from "@/lib/analytics/config";
import { registerAnalyticsOptOutHandler } from "@/lib/analytics/consent";
import { isCheckoutAnalyticsPlan } from "@/lib/analytics/events";
import {
  GUIDE_CTA_LINK_SELECTOR,
  guideCtaClickProperties,
  guideCtaViewProperties,
} from "@/lib/analytics/guide-cta";

type PostHogClient = (typeof import("posthog-js/dist/module.slim.no-external"))["default"];

let clientPromise: Promise<PostHogClient | null> | null = null;

function loadClient(apiKey: string): Promise<PostHogClient | null> {
  if (!clientPromise) {
    clientPromise = import("posthog-js/dist/module.slim.no-external")
      .then(({ default: posthog }) => {
        posthog.init(apiKey, buildPostHogClientConfig(window.location.origin));
        return posthog;
      })
      .catch(() => null);
  }
  return clientPromise;
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
    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5 || seen.has(entry.target)) {
            continue;
          }
          seen.add(entry.target);
          const properties = guideCtaViewProperties(
            entry.target as Element,
            window.location.pathname,
          );
          if (!properties) {
            continue;
          }
          void loadClient(apiKey).then((posthog) => {
            posthog?.capture("guide_cta_viewed", properties, { send_instantly: true });
          });
        }
      },
      { threshold: 0.5 },
    );
    for (const element of document.querySelectorAll(GUIDE_CTA_LINK_SELECTOR)) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [apiKey, consented, pathname]);

  return null;
}
