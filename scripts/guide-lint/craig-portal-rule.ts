import { SOURCE_PLATFORM_HOSTS } from "./links";
import { findLinks, proseLines } from "./source";
import type { GuideLintFailure, SourceLine } from "./types";

/** The Craig 27 Oct portal rule applies to guides approved on or after this date. */
export const CRAIG_PORTAL_RULE_FROM = "2026-10-27";

const PORTAL_ADVICE_PATTERNS: RegExp[] = [
  /\bsearch(?:ing)?\s+(?:on\s+)?Find a Tender\b/i,
  /\bsearch(?:ing)?\s+(?:on\s+)?Contracts Finder\b/i,
  /\bcheck(?:ing)?\s+(?:on\s+)?Find a Tender\b/i,
  /\bcheck(?:ing)?\s+(?:on\s+)?Contracts Finder\b/i,
  /\bstart(?:ing)?\s+(?:with|on)\s+Find a Tender\b/i,
  /\bregister(?:ing)?\s+(?:your business\s+)?(?:on|with)\s+Find a Tender\b/i,
  /\bbrowse\s+(?:on\s+)?Find a Tender\b/i,
  /\buse\s+Find a Tender\s+to\b/i,
  /\buse\s+Contracts Finder\s+to\b/i,
  /\bsearch(?:ing)?\s+(?:on\s+)?Public Contracts Scotland\b/i,
  /\bcheck(?:ing)?\s+(?:on\s+)?Public Contracts Scotland\b/i,
  /\bstart(?:ing)?\s+(?:with|on)\s+Public Contracts Scotland\b/i,
];

const HARDCODED_COUNT = /\b\d{2,}\s+live\s+UK\s+opportunities\b/i;

/** Body lines with fenced code removed, keeping the original line numbers. */
function withoutFencedCode(body: SourceLine[]): SourceLine[] {
  const out: SourceLine[] = [];
  let inFence = false;
  for (const { line, text } of body) {
    if (/^\s*```/.test(text)) {
      inFence = !inFence;
      out.push({ line, text: "" });
      continue;
    }
    out.push({ line, text: inFence ? "" : text });
  }
  return out;
}

function isSourcePlatformLink(href: string): boolean {
  const trimmed = href.trim();
  const candidate = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
  try {
    return SOURCE_PLATFORM_HOSTS.has(new URL(candidate).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isDealAtlasCta(href: string): boolean {
  const pathname = href.split(/[?#]/)[0] || "";
  return pathname === "/deals" || pathname === "/pricing";
}

export function lintCraigPortalRule(
  file: string,
  frontmatterLines: SourceLine[],
  bodyLines: SourceLine[],
  parsedData: Record<string, string | boolean> | null,
): GuideLintFailure[] {
  const approvedAt = parsedData?.craigApprovedAt;
  if (
    typeof approvedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(approvedAt) ||
    approvedAt < CRAIG_PORTAL_RULE_FROM
  ) {
    return [];
  }

  const failures: GuideLintFailure[] = [];
  const prose = proseLines(withoutFencedCode(bodyLines));
  const links = findLinks(prose);

  for (const link of links) {
    if (isSourcePlatformLink(link.href)) {
      failures.push({
        file,
        line: link.line,
        rule: "craig-portal-link",
        message: `guide links to a tender source platform: ${link.href}`,
      });
    }
  }

  for (const { line, text } of prose) {
    for (const pattern of PORTAL_ADVICE_PATTERNS) {
      const match = pattern.exec(text);
      if (match) {
        failures.push({
          file,
          line,
          rule: "craig-portal-advice",
          message: `guide advises using a free tender portal: "${match[0]}"`,
        });
        break;
      }
    }
    if (HARDCODED_COUNT.test(text)) {
      failures.push({
        file,
        line,
        rule: "craig-hardcoded-count",
        message: "use {{LIVE_COUNT}} instead of a hardcoded live opportunity count",
      });
    }
  }

  if (!links.some((link) => isDealAtlasCta(link.href))) {
    failures.push({
      file,
      line: bodyLines[0]?.line ?? frontmatterLines[0]?.line ?? 1,
      rule: "craig-dealatlas-cta",
      message: "guide needs an internal CTA to /deals or /pricing",
    });
  }

  return failures;
}
