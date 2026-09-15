import type { SanitisedMatchReason } from "@/lib/matching/types";
import { MatchScore } from "@/components/deals/match-score";

export function MatchReasons({
  score,
  reasons,
  mismatches,
  caption,
}: {
  score: number;
  reasons: SanitisedMatchReason[];
  mismatches?: SanitisedMatchReason[];
  caption?: string;
}) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="match-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="match-heading" className="font-heading text-lg font-semibold">
          Relevance
        </h2>
        <MatchScore score={score} />
      </div>
      <p className="text-[0.8125rem] leading-5 text-muted-foreground">
        {caption ??
          "DealAtlas analysis against your company profile, not an official procurement fact."}
      </p>
      {reasons.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
          {reasons.map((reason) => (
            <li key={`${reason.code}-${reason.label}`}>{reason.label}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No preview reasons yet.</p>
      )}
      {mismatches && mismatches.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Possible mismatches</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
            {mismatches.map((reason) => (
              <li key={`mismatch-${reason.code}-${reason.label}`}>{reason.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
