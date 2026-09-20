import type { ReactNode } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ALERT_TYPE_LABELS, type AlertCentreDto, type AlertDto } from "@/lib/alerts/types";
import { PLANS } from "@/lib/constants";

export function AlertArticle({
  alert,
  plan,
  actions,
}: {
  alert: AlertDto;
  plan: AlertCentreDto["plan"];
  actions?: ReactNode;
}) {
  const entitled = plan === PLANS.PRO;

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{ALERT_TYPE_LABELS[alert.alertType]}</Badge>
        {alert.status === "UNREAD" ? <Badge>Unread</Badge> : null}
      </div>
      <h2 className="font-heading text-lg font-semibold">{alert.title}</h2>
      <p className="text-[0.9375rem] leading-6 text-muted-foreground">
        {alert.message}
      </p>
      {alert.previewTitle && plan !== PLANS.PRO ? (
        <p className="text-sm">Preview: {alert.previewTitle}</p>
      ) : null}
      {entitled && alert.buyerName ? (
        <p className="text-sm">Buyer: {alert.buyerName}</p>
      ) : null}
      {entitled && alert.exactDeadline ? (
        <p className="text-sm">Deadline: {alert.exactDeadline}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={alert.href}>
            {entitled ? "Open opportunity" : "Review sanitised preview"}
          </Link>
        </Button>
        {entitled && alert.sourceUrl ? (
          <Button asChild variant="outline">
            <a href={alert.sourceUrl} rel="noreferrer" target="_blank">
              Open source
            </a>
          </Button>
        ) : null}
        {actions}
      </div>
    </article>
  );
}
