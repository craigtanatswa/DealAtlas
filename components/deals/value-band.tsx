export function ValueBand({ value }: { value: string | null }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.8125rem] leading-5 text-foreground">
      <span className="font-medium">Value</span>
      <span>{value ?? "Not stated"}</span>
    </span>
  );
}
