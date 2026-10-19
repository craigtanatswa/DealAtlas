/**
 * Minimal, allow-list markdown parser for editorial guides.
 *
 * It produces a plain data tree that is rendered as React elements, so raw
 * HTML in a guide is never interpreted: HTML comments are dropped and any
 * other markup is kept as escaped text. Link targets are restricted to
 * https/http, mailto and same-site paths; anything else renders as text.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 2 | 3 | 4; id: string; children: Inline[]; text: string }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; head: Inline[][]; rows: Inline[][][] };

const SAFE_ABSOLUTE = /^(?:https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+)$/i;
const SAFE_RELATIVE = /^(?:\/(?!\/)[^\s"'<>\\]*|#[A-Za-z0-9_-]+)$/;

export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (SAFE_ABSOLUTE.test(href) || SAFE_RELATIVE.test(href)) {
    return href;
  }
  return null;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  let index = 0;

  const flush = () => {
    if (buffer) {
      out.push({ type: "text", value: buffer });
      buffer = "";
    }
  };

  while (index < source.length) {
    const rest = source.slice(index);

    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      flush();
      const href = safeHref(link[2]);
      const children = parseInline(link[1]);
      if (href) {
        out.push({ type: "link", href, children });
      } else {
        out.push(...children);
      }
      index += link[0].length;
      continue;
    }

    const strong = /^\*\*([^*]+)\*\*/.exec(rest);
    if (strong) {
      flush();
      out.push({ type: "strong", children: parseInline(strong[1]) });
      index += strong[0].length;
      continue;
    }

    const em = /^\*([^*\s][^*]*)\*/.exec(rest);
    if (em) {
      flush();
      out.push({ type: "em", children: parseInline(em[1]) });
      index += em[0].length;
      continue;
    }

    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      out.push({ type: "code", value: code[1] });
      index += code[0].length;
      continue;
    }

    buffer += source[index];
    index += 1;
  }

  flush();
  return out;
}

export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) =>
      node.type === "text" || node.type === "code"
        ? node.value
        : inlineText(node.children),
    )
    .join("");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const TABLE_SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

export function parseMarkdown(markdown: string): Block[] {
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, "");
  const lines = withoutComments.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const usedIds = new Map<string, number>();
  let index = 0;

  const uniqueId = (text: string) => {
    const base = slugifyHeading(text) || "section";
    const seen = usedIds.get(base) ?? 0;
    usedIds.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(trimmed);
    if (heading) {
      // The page renders the only H1 from frontmatter; clamp body headings to h2-h4.
      const level = Math.min(4, Math.max(2, heading[1].length)) as 2 | 3 | 4;
      const children = parseInline(heading[2]);
      const text = inlineText(children);
      blocks.push({ type: "heading", level, id: uniqueId(text), children, text });
      index += 1;
      continue;
    }

    if (
      trimmed.startsWith("|") &&
      index + 1 < lines.length &&
      TABLE_SEPARATOR.test(lines[index + 1].trim())
    ) {
      const head = splitRow(trimmed).map(parseInline);
      const rows: Inline[][][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(splitRow(lines[index]).map(parseInline));
        index += 1;
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/;
    const numbered = /^\d+[.)]\s+(.*)$/;
    const listMatch = bullet.exec(trimmed) ?? numbered.exec(trimmed);
    if (listMatch) {
      const ordered = !bullet.test(trimmed);
      const pattern = ordered ? numbered : bullet;
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        const match = pattern.exec(current);
        if (match) {
          items.push(match[1]);
        } else if (current && items.length > 0 && /^\s+/.test(lines[index])) {
          items[items.length - 1] += ` ${current}`;
        } else {
          break;
        }
        index += 1;
      }
      blocks.push({ type: "list", ordered, items: items.map(parseInline) });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (
        !current ||
        /^#{1,6}\s/.test(current) ||
        bullet.test(current) ||
        numbered.test(current) ||
        (current.startsWith("|") &&
          index + 1 < lines.length &&
          TABLE_SEPARATOR.test(lines[index + 1].trim()))
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
  }

  return blocks;
}

export type FaqItem = { question: string; answer: string };

/**
 * FAQ entries come from the visible `## FAQ` section: each `###` question
 * followed by its paragraphs. The same blocks render on the page, so the
 * FAQPage JSON-LD text is the visible text, word for word.
 */
export function extractFaq(blocks: Block[]): FaqItem[] {
  const start = blocks.findIndex(
    (block) => block.type === "heading" && block.level === 2 && /^faqs?$/i.test(block.text),
  );
  if (start < 0) {
    return [];
  }
  const items: FaqItem[] = [];
  let current: { question: string; answer: string[] } | null = null;
  for (const block of blocks.slice(start + 1)) {
    if (block.type === "heading" && block.level === 2) {
      break;
    }
    if (block.type === "heading") {
      if (current) items.push({ question: current.question, answer: current.answer.join(" ") });
      current = { question: block.text, answer: [] };
      continue;
    }
    if (current && block.type === "paragraph") {
      current.answer.push(inlineText(block.children));
    }
  }
  if (current) items.push({ question: current.question, answer: current.answer.join(" ") });
  return items.filter((item) => item.question && item.answer);
}

export type BlockCtaPosition = "mid" | "after_answer" | "end";

/**
 * Where each block sits for guide CTA analytics: the "short answer" section is
 * `after_answer`, the last section before the FAQ/Sources tail is `end`, and
 * everything else is `mid`.
 */
export function blockCtaPositions(blocks: Block[]): BlockCtaPosition[] {
  const isH2 = (block: Block) => block.type === "heading" && block.level === 2;
  const tailStart = blocks.findIndex(
    (block) => isH2(block) && block.type === "heading" && /^(faqs?|sources)$/i.test(block.text),
  );
  const tail = tailStart < 0 ? blocks.length : tailStart;
  let endStart = -1;
  for (let index = tail - 1; index >= 0; index -= 1) {
    if (isH2(blocks[index])) {
      endStart = index;
      break;
    }
  }

  let section: BlockCtaPosition = "mid";
  return blocks.map((block, index) => {
    if (block.type === "heading" && block.level === 2) {
      section =
        index === endStart && index < tail
          ? "end"
          : /short answer/i.test(block.text)
            ? "after_answer"
            : "mid";
    }
    return section;
  });
}
