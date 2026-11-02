"use client";

import { useEffect, useState } from "react";

import {
  analyticsConsent,
  hasAnalyticsConsent,
  subscribeToAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics/consent";

export function useAnalyticsConsent(): boolean {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    const sync = () => setConsented(hasAnalyticsConsent());
    sync();
    return subscribeToAnalyticsConsent(sync);
  }, []);

  return consented;
}

export function useAnalyticsConsentChoice(): AnalyticsConsent {
  const [choice, setChoice] = useState<AnalyticsConsent>("unknown");

  useEffect(() => {
    const sync = () => setChoice(analyticsConsent());
    sync();
    return subscribeToAnalyticsConsent(sync);
  }, []);

  return choice;
}
