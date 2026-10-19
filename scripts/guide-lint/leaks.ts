import { PORTAL_TERMS } from "@/lib/preview/risk";
import { SOURCE_PLATFORM_MARKERS } from "@/lib/redaction/gate-vocabulary";

import { isAllowedOutbound } from "./links";
import { findLinks, proseLines } from "./source";
import type { GuideLintContext, GuideLintFailure, SourceLine } from "./types";

/**
 * BUYER NAME DENYLIST HOOK.
 *
 * The repo has no static buyer-name denylist: the preview gate and the leak
 * scan get buyer names per deal from the database (lib/leak-scan/tokens.ts,
 * BUYER_NAME tokens), and none of that is available or appropriate in CI.
 * Add names here (any case) to fail any guide that mentions them.
 */
export const BUYER_NAME_DENYLIST: readonly string[] = [];

/**
 * Shared terms the guide lint does not use: they are ordinary English words
 * ("intend", "ted") in editorial prose. The shared lists are not changed.
 */
export const GUIDE_PORTAL_TERM_EXCLUSIONS: readonly string[] = ["intend", "ted"];

/**
 * Portal names, reused from the gate vocabulary (SOURCE_PLATFORM_MARKERS,
 * mirrored in private.leak_gate_terms) and the free-text risk detector
 * (PORTAL_TERMS, mirrored in private.preview_detail_text_risky), minus
 * GUIDE_PORTAL_TERM_EXCLUSIONS. Matched as whole words only.
 */
export const GUIDE_PORTAL_TERMS: readonly string[] = [
  ...new Set([...SOURCE_PLATFORM_MARKERS, ...PORTAL_TERMS].map((term) => term.toLowerCase())),
]
  .filter((term) => !GUIDE_PORTAL_TERM_EXCLUSIONS.includes(term))
  .sort();

/** How close (in characters, same line) a portal name may sit to a link before it fails. */
export const PORTAL_LINK_WINDOW = 40;

const ID_PATTERNS: Array<[rule: string, label: string, pattern: RegExp]> = [
  ["leak-ocds", "OCDS id", /\bocds-[a-z0-9]/gi],
  ["leak-notice-id", "Find a Tender notice id", /\b\d{6}-\d{4}\b/g],
  ["leak-notice-id", "notice UUID", /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi],
  ["leak-notice-id", "tender id", /\btender_[a-z0-9]+/gi],
  ["leak-reference", "reference number", /\b(?:our\s+|buyer\s+|contract\s+|tender\s+)?ref(?:erence)?\.?\s*(?:no\.?|number|id)?\s*[:#]\s*[A-Za-z0-9][\w/-]*/gi],
  ["leak-reference", "framework reference", /\bRM\s?\d{3,4}\b/g],
  ["leak-email", "email address", /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi],
  ["leak-phone", "UK phone number", /(?:\+44\s?\(?0?\)?\s?|\b0)\d(?:[\s-]?\d){8,9}\b/g],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole word or phrase: no letter or digit directly before or after. */
function termPattern(term: string): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term.toLowerCase())}(?=$|[^\\p{L}\\p{N}])`, "giu");
}

function termHits(text: string, terms: readonly string[]): Array<{ term: string; start: number; end: number }> {
  const hits: Array<{ term: string; start: number; end: number }> = [];
  for (const term of terms) {
    if (!term.trim()) continue;
    for (const match of text.matchAll(termPattern(term))) {
      const start = (match.index ?? 0) + match[1].length;
      hits.push({ term, start, end: start + term.length });
    }
  }
  return hits;
}

export function lintLeaks(
  file: string,
  frontmatter: SourceLine[],
  body: SourceLine[],
  ctx: GuideLintContext,
): GuideLintFailure[] {
  const failures: GuideLintFailure[] = [];
  const all = [...frontmatter, ...body];

  for (const { line, text } of all) {
    for (const [rule, label, pattern] of ID_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        // A Find a Tender id (123456-2026) is reported as a notice id, not a phone number.
        if (rule === "leak-phone" && /^\d{6}-\d{4}$/.test(match[0].trim())) continue;
        failures.push({ file, line, rule, message: `${label}: ${match[0].trim()}` });
      }
    }
    for (const hit of termHits(text, ctx.buyerDenylist)) {
      failures.push({ file, line, rule: "leak-buyer", message: `denylisted buyer name: ${hit.term}` });
    }
  }

  const prose = proseLines(body);
  const links = findLinks(prose);
  // Search the words around a link, not the URLs themselves: an allowed
  // find-tender search URL must not count as a portal name next to itself.
  const textByLine = new Map(prose.map((entry) => [entry.line, entry.text]));
  for (const link of links) {
    const text = textByLine.get(link.line) ?? "";
    const hrefAt = text.indexOf(link.href, link.index);
    if (hrefAt >= 0) {
      textByLine.set(
        link.line,
        `${text.slice(0, hrefAt)}${" ".repeat(link.href.length)}${text.slice(hrefAt + link.href.length)}`,
      );
    }
  }
  const seen = new Set<string>();
  for (const link of links) {
    // A citation to an allowed public host may name the portal it describes.
    if (isAllowedOutbound(link.href.trim())) continue;
    const text = textByLine.get(link.line) ?? "";
    const from = Math.max(0, link.index - PORTAL_LINK_WINDOW);
    const to = link.index + link.raw.length + PORTAL_LINK_WINDOW;
    for (const hit of termHits(text, GUIDE_PORTAL_TERMS)) {
      if (hit.end <= from || hit.start >= to) continue;
      const key = `${link.line}:${hit.start}:${hit.term}`;
      if (seen.has(key)) continue;
      seen.add(key);
      failures.push({
        file,
        line: link.line,
        rule: "leak-portal-link",
        message: `portal name "${hit.term}" next to a link (${link.href})`,
      });
    }
  }
  return failures;
}
