import { cn } from "@/lib/utils";

export function DeadlineBand({ value }: { value: string | null }) {
  const closingSoon =
    value != null && /soon|week|days?/i.test(value) && !/not stated/i.test(value);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[0.8125rem] leading-5 text-foreground",
        closingSoon ? "bg-warning/15" : "bg-muted",
      )}
    >
      <span className="font-medium">Closing</span>
      <span>{value ?? "Not stated"}</span>
    </span>
  );
}
