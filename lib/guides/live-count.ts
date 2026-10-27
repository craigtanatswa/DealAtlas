import type { Guide } from "@/lib/guides/content";
import { extractFaq, type Block, type Inline } from "@/lib/guides/markdown";

export const LIVE_COUNT_TOKEN = "{{LIVE_COUNT}}";

const TOKEN_PATTERN = /\{\{[^}]+\}\}/;

function replaceTokens(value: string, count: string): string {
  return value.split(LIVE_COUNT_TOKEN).join(count);
}

function mapInline(nodes: Inline[], count: string): Inline[] {
  return nodes.map((node) => {
    switch (node.type) {
      case "text":
        return node.value.includes(LIVE_COUNT_TOKEN)
          ? { ...node, value: replaceTokens(node.value, count) }
          : node;
      case "code":
        return node;
      case "strong":
      case "em":
        return { ...node, children: mapInline(node.children, count) };
      case "link":
        return { ...node, children: mapInline(node.children, count) };
      default:
        return node;
    }
  });
}

/** Replace {{LIVE_COUNT}} in guide blocks with the live total. */
export function applyLiveCount(blocks: Block[], count: number): Block[] {
  const text = String(count);
  return blocks.map((block) => {
    switch (block.type) {
      case "paragraph":
        return { ...block, children: mapInline(block.children, text) };
      case "heading":
        return {
          ...block,
          children: mapInline(block.children, text),
          text: replaceTokens(block.text, text),
        };
      case "list":
        return {
          ...block,
          items: block.items.map((item) => mapInline(item, text)),
        };
      case "table":
        return {
          ...block,
          head: block.head.map((cell) => mapInline(cell, text)),
          rows: block.rows.map((row) => row.map((cell) => mapInline(cell, text))),
        };
      default:
        return block;
    }
  });
}

/** True when any rendered field or block still contains a {{...}} token. */
export function guideNeedsLiveCount(guide: Guide): boolean {
  return TOKEN_PATTERN.test(
    JSON.stringify({
      title: guide.title,
      description: guide.description,
      h1: guide.h1,
      breadcrumb: guide.breadcrumb,
      blocks: guide.blocks,
    }),
  );
}

/** Return a copy of the guide with {{LIVE_COUNT}} replaced in every rendered field. */
export function substituteLiveCountInGuide(guide: Guide, count: number): Guide {
  const text = String(count);
  const blocks = applyLiveCount(guide.blocks, count);
  const resolved: Guide = {
    ...guide,
    title: replaceTokens(guide.title, text),
    description: replaceTokens(guide.description, text),
    h1: replaceTokens(guide.h1, text),
    breadcrumb: replaceTokens(guide.breadcrumb, text),
    blocks,
    faq: extractFaq(blocks),
  };
  const fields = [
    resolved.title,
    resolved.description,
    resolved.h1,
    resolved.breadcrumb,
    JSON.stringify(resolved.blocks),
  ];
  for (const field of fields) {
    const leftover = TOKEN_PATTERN.exec(field);
    if (leftover) {
      throw new Error(`Unfilled guide token ${leftover[0]} in "${resolved.slug}"`);
    }
  }
  return resolved;
}
