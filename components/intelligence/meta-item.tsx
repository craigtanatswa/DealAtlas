export function MetaItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <dt className="text-[0.8125rem] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value ?? "Not stated"}</dd>
    </div>
  );
}
