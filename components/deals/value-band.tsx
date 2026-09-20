export function ValueBand({ value }: { value: string | null }) {
  return (
    <span className="inline-flex max-w-full items-baseline gap-1 text-[0.8125rem] leading-5 text-foreground">
      <span className="font-medium text-muted-foreground">Value</span>
      <span>{value ?? "Not stated"}</span>
    </span>
  );
}
