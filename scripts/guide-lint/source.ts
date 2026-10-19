import type { SourceLine } from "./types";

export type SplitGuide = {
  /** Frontmatter lines, numbered as in the file. */
  frontmatter: SourceLine[];
  /** Body lines, numbered as in the file. */
  body: SourceLine[];
};

/** Splits a guide into numbered frontmatter and body lines. Same `---` fences as lib/guides/content.ts. */
export function splitGuide(source: string): SplitGuide | null {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  return {
    frontmatter: lines.slice(1, end).map((text, index) => ({ line: index + 2, text })),
    body: lines.slice(end + 1).map((text, index) => ({ line: end + index + 2, text })),
  };
}

/**
 * Body lines with HTML comments and JSON-LD blocks blanked out. JSON-LD
 * (a ```json-ld / ```ld+json fence or an application/ld+json script) is exempt
 * from the link rules. Line numbers are kept.
 */
export function proseLines(body: SourceLine[]): SourceLine[] {
  const out: SourceLine[] = [];
  let inJsonLd: "fence" | "script" | null = null;
  let inComment = false;
  for (const { line, text } of body) {
    const trimmed = text.trim();
    if (inJsonLd === "fence") {
      if (/^```\s*$/.test(trimmed)) inJsonLd = null;
      out.push({ line, text: "" });
      continue;
    }
    if (inJsonLd === "script") {
      if (/<\/script>/i.test(trimmed)) inJsonLd = null;
      out.push({ line, text: "" });
      continue;
    }
    if (/^```\s*(?:json-?ld|ld\+json)\s*$/i.test(trimmed)) {
      inJsonLd = "fence";
      out.push({ line, text: "" });
      continue;
    }
    if (/<script[^>]*application\/ld\+json/i.test(trimmed)) {
      if (!/<\/script>/i.test(trimmed)) inJsonLd = "script";
      out.push({ line, text: "" });
      continue;
    }
    let value = text;
    if (inComment) {
      const close = value.indexOf("-->");
      if (close < 0) {
        out.push({ line, text: "" });
        continue;
      }
      value = value.slice(close + 3);
      inComment = false;
    }
    value = value.replace(/<!--[\s\S]*?-->/g, "");
    const open = value.indexOf("<!--");
    if (open >= 0) {
      value = value.slice(0, open);
      inComment = true;
    }
    out.push({ line, text: value });
  }
  return out;
}

export type FoundLink = { line: number; text: string; href: string; index: number; raw: string };

/** Markdown links `[text](href)`, autolinks `<https://...>` and bare URLs. */
export function findLinks(lines: SourceLine[]): FoundLink[] {
  const links: FoundLink[] = [];
  for (const { line, text } of lines) {
    const covered: Array<[number, number]> = [];
    for (const match of text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
      const index = match.index ?? 0;
      links.push({ line, text: match[1], href: match[2], index, raw: match[0] });
      covered.push([index, index + match[0].length]);
    }
    for (const match of text.matchAll(/<((?:https?|mailto):[^>\s]+)>/gi)) {
      const index = match.index ?? 0;
      links.push({ line, text: "", href: match[1], index, raw: match[0] });
      covered.push([index, index + match[0].length]);
    }
    for (const match of text.matchAll(/\b(?:https?:\/\/|www\.)[^\s)<>\]]+/gi)) {
      const index = match.index ?? 0;
      if (covered.some(([start, end]) => index >= start && index < end)) continue;
      const href = match[0].replace(/[.,;:]+$/, "");
      links.push({ line, text: "", href, index, raw: href });
    }
  }
  return links;
}
