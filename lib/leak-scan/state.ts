import fs from "node:fs";
import path from "node:path";

import type { ManifestToken } from "@/tests/leak/lib/scan";

import type { LeakFindingReport } from "@/lib/leak-scan/report";

export type LegacySlug = {
  dealId: string;
  slug: string;
};

/** Source tokens for one deal. Deal pages use that set plus the strong-token union. */
export type DealTokenSet = {
  dealId: string;
  slug: string;
  tokens: ManifestToken[];
};

export type ScanState = {
  scanned: number;
  failed: number;
  findings: LeakFindingReport[];
  legacySlugs: LegacySlug[];
  dealTokens: DealTokenSet[];
  incompleteAlerted?: boolean;
};

export function statePath(): string {
  return process.env.LEAK_SCAN_STATE || path.join(process.cwd(), ".leak-scan", "state.json");
}

export function emptyState(): ScanState {
  return { scanned: 0, failed: 0, findings: [], legacySlugs: [], dealTokens: [] };
}

export function writeState(state: ScanState, file = statePath()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state)}\n`);
}

export function readState(file = statePath()): ScanState | null {
  if (!fs.existsSync(file)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<ScanState>;
  return {
    scanned: parsed.scanned ?? 0,
    failed: parsed.failed ?? 0,
    findings: Array.isArray(parsed.findings) ? parsed.findings : [],
    legacySlugs: Array.isArray(parsed.legacySlugs) ? parsed.legacySlugs : [],
    dealTokens: Array.isArray(parsed.dealTokens) ? parsed.dealTokens : [],
    incompleteAlerted: parsed.incompleteAlerted === true,
  };
}
