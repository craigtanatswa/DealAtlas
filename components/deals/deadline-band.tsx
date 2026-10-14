import { cn } from "@/lib/utils";

export function DeadlineBand({ value }: { value: string | null }) {
  if (value == null || value === "Upcoming / date not yet fixed") {
    return <span className="text-[0.8125rem] leading-5 text-foreground">Deadline TBC</span>;
  }
  const closingSoon = /soon|week|days?/i.test(value) && !/not stated/i.test(value);

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
