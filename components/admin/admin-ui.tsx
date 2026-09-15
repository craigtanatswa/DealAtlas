import type { ReactNode } from "react";

import { Heading, Text } from "@/components/layout/heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-2">
        <Heading>{title}</Heading>
        <Text variant="muted" className="max-w-3xl">
          {description}
        </Text>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminStatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "text-2xl font-semibold tracking-tight",
            tone === "warning" && "text-warning-foreground",
            tone === "danger" && "text-destructive",
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AdminMetaList({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-border bg-card px-4 py-3">
          <dt className="text-[0.8125rem] text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LeakageBadge({
  risk,
  published,
  held,
}: {
  risk: string | null;
  published?: boolean | null;
  held?: boolean | null;
}) {
  if (held) {
    return <Badge variant="warning">Held unpublished</Badge>;
  }
  if (risk === "HIGH") {
    return <Badge variant="destructive">HIGH</Badge>;
  }
  if (risk === "REVIEW") {
    return <Badge variant="warning">REVIEW</Badge>;
  }
  if (published) {
    return <Badge variant="success">Published</Badge>;
  }
  if (risk === "LOW") {
    return <Badge variant="outline">LOW unpublished</Badge>;
  }
  return <Badge variant="outline">No preview</Badge>;
}

export function JsonBlock({ value, label }: { value: string; label: string }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-muted/30">
      <figcaption className="border-b border-border px-4 py-2 text-[0.8125rem] text-muted-foreground">
        {label}
      </figcaption>
      <pre className="max-h-[32rem] overflow-auto p-4 text-[0.8125rem] leading-5 whitespace-pre-wrap break-all">
        {value || "—"}
      </pre>
    </figure>
  );
}
