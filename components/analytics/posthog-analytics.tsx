"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  isAlertsEventName,
  type AlertsEventProperties,
} from "@/lib/alerts/analytics";
import { recordLanding, recordPageView } from "@/lib/analytics/attribution";
import { buildPostHogClientConfig } from "@/lib/analytics/config";
import { isCheckoutAnalyticsPlan } from "@/lib/analytics/events";
import { guideCtaClickProperties } from "@/lib/analytics/guide-cta";

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

  useEffect(() => {
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
      void loadClient(apiKey).then((posthog) => {
        posthog?.capture("guide_cta_clicked", properties, { send_instantly: true });
      });
    };
    const onAlertsEvent = (event: Event) => {
      const detail = (event as CustomEvent<{
        name?: unknown;
        properties?: unknown;
      }>).detail;
      if (
        !detail ||
        !isAlertsEventName(detail.name) ||
        typeof detail.properties !== "object" ||
        detail.properties === null
      ) {
        return;
      }
      const name = detail.name;
      // Rebuild from the two allowed keys so nothing else can ride along.
      const raw = detail.properties as Partial<AlertsEventProperties>;
      const properties: AlertsEventProperties = { category_slug: raw.category_slug! };
      if (raw.outcome) properties.outcome = raw.outcome;
      void loadClient(apiKey).then((posthog) => {
        posthog?.capture(name, properties);
      });
    };
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("dealatlas:alerts-event", onAlertsEvent);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("dealatlas:alerts-event", onAlertsEvent);
    };
  }, [apiKey]);

  useEffect(() => {
    recordPageView(pathname);
    void loadClient(apiKey).then((posthog) => {
      posthog?.capture("$pageview");
    });
  }, [apiKey, pathname]);

  return null;
}
