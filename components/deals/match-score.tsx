export function MatchScore({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  return (
    <div
      className="flex items-center gap-2"
      aria-label={`Match score ${clamped} out of 100`}
    >
      <span className="text-[0.8125rem] leading-5 font-medium text-foreground tabular-nums">
        Match {clamped}
      </span>
      <span
        className="bg-muted h-1.5 w-16 overflow-hidden rounded-full"
        aria-hidden="true"
      >
        <span
          className="bg-intelligence block h-full rounded-full"
          style={{ width: `${clamped}%` }}
        />
      </span>
    </div>
  );
}
