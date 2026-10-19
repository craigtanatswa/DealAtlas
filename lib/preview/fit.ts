import type { SuitabilityLevel } from "@/components/deals/types";
import { REQUIREMENT_PREVIEW_LABELS } from "@/lib/preview/labels";

/**
 * Fit labels show positive fit only. Low, unknown and missing values are hidden
 * rather than shown as a negative or as "Not stated".
 */
export function positiveFitLabel(level: SuitabilityLevel | null | undefined): string | null {
  if (level === "HIGH") return "High";
  if (level === "MEDIUM") return "Medium";
  return null;
}

const FIXED_LABELS = new Set<string>(REQUIREMENT_PREVIEW_LABELS);

/**
 * Requirement lines worth showing. The fixed free-DTO labels (e.g. "financial capacity
 * evidence") always render. Only empty, whitespace-only, punctuation-only, single-word
 * stubs and duplicates are dropped.
 */
export function readableRequirementLines(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const key = line.toLowerCase().replace(/\s+/g, " ");
    if (!/[\p{L}\p{N}]/u.test(line) || seen.has(key)) continue;
    const words = line.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
    if (!FIXED_LABELS.has(line) && words.length < 2) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}
