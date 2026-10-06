export type LeakFindingReport = {
  dealId: string;
  code: string;
  path: string;
};

/** More than 5% of scanned published previews failing raises severity only. */
export const FAIL_RATE_FOR_ERROR = 0.05;

export function alertSeverity(failed: number, scanned: number): "warning" | "error" {
  if (scanned > 0 && failed / scanned > FAIL_RATE_FOR_ERROR) {
    return "error";
  }
  return "warning";
}

export function reportLine(finding: LeakFindingReport): string {
  return `deal_id=${finding.dealId} code=${finding.code} path=${finding.path}`;
}
