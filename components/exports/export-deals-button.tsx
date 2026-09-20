"use client";

import { useState } from "react";
import Link from "next/link";

import { FormStatus } from "@/components/auth/form-status";
import { Button } from "@/components/ui/button";
import {
  exportActionAriaLabel,
  exportActionLabel,
  exportCopyContextFromProps,
  exportPaywallCaption,
  exportPaywallLabel,
} from "@/lib/exports/copy";
import { exportQuotaLabel, QUOTA_ERROR_COPY } from "@/lib/quotas";
import { toSavedSearchFilters } from "@/lib/saves/filters";
import type { PublicSearchFilters } from "@/lib/search/params";

type ExportDealsButtonProps = {
  isPro: boolean;
  used: number;
  limit: number | null;
} & (
  | { source: "filters"; filters: PublicSearchFilters }
  | { source: "saved" }
  | { source: "dealIds"; dealIds: string[] }
);

function filenameFromDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /filename="([^"]+)"/i.exec(header);
  return match?.[1] ?? null;
}

function requestBody(props: ExportDealsButtonProps) {
  if (props.source === "saved") {
    return { saved: true as const };
  }
  if (props.source === "dealIds") {
    return { dealIds: props.dealIds };
  }
  return { filters: toSavedSearchFilters(props.filters) };
}

export function ExportDealsButton(props: ExportDealsButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const atLimit = props.limit !== null && props.used >= props.limit;
  const copyContext = exportCopyContextFromProps(props);

  if (!props.isPro) {
    return (
      <div className="flex flex-col gap-2">
        <Button asChild variant="outline">
          <Link href="/pricing">{exportPaywallLabel(copyContext)}</Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          {exportPaywallCaption(copyContext)}
        </p>
      </div>
    );
  }

  if (atLimit) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{QUOTA_ERROR_COPY.exportRows}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {exportQuotaLabel(props.used, props.limit)}
        </p>
      </div>
    );
  }

  async function onExport() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(props)),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? "Opportunities could not be exported.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        filenameFromDisposition(response.headers.get("Content-Disposition")) ??
        "dealatlas-deals.csv";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Opportunities could not be exported.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onExport}
          disabled={pending}
          aria-label={exportActionAriaLabel(copyContext)}
        >
          {exportActionLabel(pending)}
        </Button>
        <p className="text-sm text-muted-foreground tabular-nums">
          {exportQuotaLabel(props.used, props.limit)}
        </p>
      </div>
      <FormStatus error={error} />
    </div>
  );
}
