import type { ReactNode } from "react";

import { Heading, Text } from "@/components/layout/heading";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <Heading>{title}</Heading>
          {description ? (
            typeof description === "string" ? (
              <Text variant="muted" className="mt-3 max-w-3xl">
                {description}
              </Text>
            ) : (
              <div className="mt-3 max-w-3xl">{description}</div>
            )
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

export function SectionHeader({
  id,
  title,
  description,
  action,
  className,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 max-w-3xl">
        <Heading id={id} level={2}>
          {title}
        </Heading>
        {description ? (
          typeof description === "string" ? (
            <Text variant="muted" className="mt-2">
              {description}
            </Text>
          ) : (
            <div className="mt-2">{description}</div>
          )
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
