"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { UpgradeStatusBanner } from "@/components/billing/upgrade-status-banner";
import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { dealUnlockProps } from "@/components/deals/deal-unlock-props";
import { SaveDealButton } from "@/components/saves/save-deal-button";
import { useIsAuthenticated } from "@/components/viewer/viewer-provider";
import type { FoundingPublicCount } from "@/lib/billing/founding-ui";
import type { DealViewer } from "@/lib/deals/viewer";
import { featureLimit } from "@/lib/quotas";
import type { PublicDealPreview } from "@/lib/search/dto";

function upgradedFromLocation(): boolean {
  return (
    new URLSearchParams(window.location.search).get("upgraded") === "1"
  );
}

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

export function DealViewerIsland({
  slug,
  deal,
  loginHref,
  founding,
}: {
  slug: string;
  deal: PublicDealPreview;
  loginHref: string;
  founding: FoundingPublicCount;
}) {
  const authenticated = useIsAuthenticated();
  const upgraded = useSyncExternalStore(
    subscribeToLocation,
    upgradedFromLocation,
    () => false,
  );
  const [viewer, setViewer] = useState<DealViewer | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshViewer = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    let cancelled = false;
    const isUpgraded = upgradedFromLocation();

    fetch(
      `/api/deals/${encodeURIComponent(slug)}/viewer${isUpgraded ? "?upgraded=1" : ""}`,
      { cache: "no-store", credentials: "same-origin" },
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error("viewer request failed");
        }
        return response.json() as Promise<DealViewer>;
      })
      .then((body) => {
        if (!cancelled) {
          setViewer(body);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setViewer(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated, slug, refreshKey]);

  const save = viewer ? (
    <SaveDealButton
      dealId={viewer.dealId}
      saved={viewer.saved}
      used={viewer.used}
      limit={viewer.limit}
      signedIn
      loginHref={loginHref}
      onChanged={refreshViewer}
    />
  ) : (
    <SaveDealButton
      dealId={null}
      saved={false}
      used={0}
      limit={featureLimit("FREE", "savedDeals")}
      signedIn={false}
      loginHref={loginHref}
    />
  );

  const unlock = dealUnlockProps({ viewer, slug, loginHref, founding });

  return (
    <>
      {authenticated && upgraded ? (
        <UpgradeStatusBanner
          initialPro={viewer?.mode === "pro"}
          onConfirmed={refreshViewer}
        />
      ) : null}
      <DealPreviewDetail
        deal={deal}
        match={viewer?.mode === "pro" ? viewer.match ?? null : null}
        save={save}
        signedIn={viewer !== null}
        unlock={unlock}
      />
    </>
  );
}
