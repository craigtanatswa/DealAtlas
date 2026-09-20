import { LockIcon } from "lucide-react";

/**
 * Placeholder for a paid intelligence field.
 * Do not pass protected values. The component has no `value` prop on purpose.
 */
export function LockedField({
  label,
  benefit,
}: {
  label: string;
  benefit: string;
}) {
  return (
    <div
      className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3"
      aria-label={`${label} is locked. ${benefit}`}
    >
      <div className="flex items-start gap-3">
        <LockIcon
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-0.5 text-pretty text-[0.8125rem] leading-5 text-muted-foreground">
            {benefit}
          </p>
          <p className="sr-only">
            Join DealAtlas Pro to unlock this field.
          </p>
        </div>
      </div>
    </div>
  );
}
