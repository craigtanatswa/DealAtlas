import type { SuitabilityLevel } from "@/components/deals/types";

/**
 * Fit labels show positive fit only. Low, unknown and missing values are hidden
 * rather than shown as a negative or as "Not stated".
 */
export function positiveFitLabel(level: SuitabilityLevel | null | undefined): string | null {
  if (level === "HIGH") return "High";
  if (level === "MEDIUM") return "Medium";
  return null;
}

const COMMON_VERBS = new Set([
  "is", "are", "be", "been", "being", "was", "were", "will", "must", "should", "shall",
  "can", "may", "need", "needs", "have", "has", "hold", "holds", "provide", "provides",
  "deliver", "delivers", "supply", "supplies", "include", "includes", "meet", "meets",
  "maintain", "maintains", "demonstrate", "demonstrates", "comply", "complies", "show",
  "shows", "carry", "carries", "operate", "operates", "manage", "manages", "support",
  "supports", "install", "installs", "submit", "submits", "attend", "attends", "use",
  "uses", "work", "works", "cover", "covers", "require", "requires", "offer", "offers",
  "ensure", "ensures", "achieve", "achieves", "complete", "completes",
]);

function hasVerb(words: string[]): boolean {
  return words.some((raw) => {
    const word = raw.toLowerCase().replace(/[^a-z-]/g, "");
    if (COMMON_VERBS.has(word)) return true;
    return word.length > 4 && (word.endsWith("ed") || word.endsWith("ing"));
  });
}

/** Requirement lines worth showing: at least 3 words and a verb. Fragments are dropped. */
export function readableRequirementLines(lines: readonly string[]): string[] {
  return lines.filter((line) => {
    const words = line.trim().split(/\s+/).filter(Boolean);
    return words.length >= 3 && hasVerb(words);
  });
}
