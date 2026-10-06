export type LeakPass = "db" | "http";

export type LeakFindingReport = {
  dealId: string;
  code: string;
  /** Published rows only. Held rows never carry a path or slug. */
  path: string | null;
  held: boolean;
  pass: LeakPass;
};

/** More than 5% of scanned published previews failing raises severity only. */
export const FAIL_RATE_FOR_ERROR = 0.05;

export function alertSeverity(failed: number, scanned: number): "warning" | "error" {
  if (scanned > 0 && failed / scanned > FAIL_RATE_FOR_ERROR) {
    return "error";
  }
  return "warning";
}

/** Email line. Held rows are deal id and rule code only. */
export function reportLine(finding: LeakFindingReport): string {
  if (finding.held) {
    return `deal_id=${finding.dealId} code=${finding.code}`;
  }
  const path = finding.path ? ` path=${finding.path}` : "";
  const deal = finding.dealId ? `deal_id=${finding.dealId} ` : "";
  return `${deal}code=${finding.code}${path}`;
}

/** Counts per rule code. No ids, paths or slugs. */
export function codeCounts(findings: LeakFindingReport[], pass: LeakPass): string {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    if (finding.pass !== pass) continue;
    counts.set(finding.code, (counts.get(finding.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, count]) => `${code}=${count}`)
    .join(",");
}
