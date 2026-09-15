import { Badge } from "@/components/ui/badge";
import {
  DEALATLAS_ANALYSIS_LABEL,
  SOURCE_RECORD_LABEL,
  type IntelligenceEvidence,
} from "@/lib/intelligence/types";

export function AnalysisBadge({
  evidence,
}: {
  evidence: Pick<IntelligenceEvidence, "kind" | "label">;
}) {
  if (evidence.kind === "inference") {
    return <Badge variant="intelligence">{DEALATLAS_ANALYSIS_LABEL}</Badge>;
  }
  return <Badge variant="outline">{SOURCE_RECORD_LABEL}</Badge>;
}

export function AnalysisCaption({
  evidence,
}: {
  evidence: IntelligenceEvidence;
}) {
  const confidence = `${Math.round(evidence.confidence * 100)}% confidence`;
  return (
    <p className="text-[0.8125rem] leading-5 text-muted-foreground">
      {evidence.label}: {evidence.note} {confidence}.
    </p>
  );
}
