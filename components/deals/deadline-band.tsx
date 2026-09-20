import { cn } from "@/lib/utils";

export function DeadlineBand({ value }: { value: string | null }) {
  const closingSoon =
    value != null && /soon|week|days?/i.test(value) && !/not stated/i.test(value);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-baseline gap-1 text-[0.8125rem] leading-5",
        closingSoon ? "text-warning-foreground" : "text-foreground",
      )}
    >
      <span className="font-medium text-muted-foreground">Closing</span>
      <span className={closingSoon ? "font-medium" : undefined}>
        {value ?? "Not stated"}
      </span>
    </span>
  );
}
