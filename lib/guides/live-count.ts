import type { Guide } from "@/lib/guides/content";
import { extractFaq, inlineText, type Block, type Inline } from "@/lib/guides/markdown";

export const LIVE_COUNT_TOKEN = "{{LIVE_COUNT}}";

/** Stable warn line when the live count cannot be fetched; carries no counts or errors. */
export const LIVE_COUNT_UNAVAILABLE_WARN =
  "Guide live count unavailable; rendering without a published total.";

const TOKEN_PATTERN = /\{\{[^}]+\}\}/;

const KNOWN_CLAUSE = `${LIVE_COUNT_TOKEN} live UK opportunities on DealAtlas today.`;
const NEUTRAL_CLAUSE = "Browse live UK opportunities on DealAtlas today.";

function replaceTokens(value: string, count: string): string {
  return value.split(LIVE_COUNT_TOKEN).join(count);
}

/** Rephrase the known live-count clause and drop any other clause holding the token. */
function stripLiveCountValue(value: string): string {
  if (!value.includes(LIVE_COUNT_TOKEN)) return value;
  let stripped = value.split(KNOWN_CLAUSE).join(NEUTRAL_CLAUSE);
  if (stripped.includes(LIVE_COUNT_TOKEN)) {
    stripped = stripped
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !sentence.includes(LIVE_COUNT_TOKEN))
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!stripped) stripped = NEUTRAL_CLAUSE;
  }
  return stripped;
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

function stripInline(nodes: Inline[]): Inline[] {
  return nodes.map((node) => {
    switch (node.type) {
      case "text":
        return node.value.includes(LIVE_COUNT_TOKEN)
          ? { ...node, value: stripLiveCountValue(node.value) }
          : node;
      case "code":
        return node;
      case "strong":
      case "em":
        return { ...node, children: stripInline(node.children) };
      case "link":
        return { ...node, children: stripInline(node.children) };
      default:
        return node;
    }
  });
}

function stripBlocks(blocks: Block[]): Block[] {
  return blocks.map((block) => {
    switch (block.type) {
      case "paragraph":
        return { ...block, children: stripInline(block.children) };
      case "heading": {
        const children = stripInline(block.children);
        return { ...block, children, text: inlineText(children) };
      }
      case "list":
        return {
          ...block,
          items: block.items.map((item) => stripInline(item)),
        };
      case "table":
        return {
          ...block,
          head: block.head.map((cell) => stripInline(cell)),
          rows: block.rows.map((row) => row.map((cell) => stripInline(cell))),
        };
      default:
        return block;
    }
  });
}

function assertNoLeftoverTokens(guide: Guide): void {
  const fields = [
    guide.title,
    guide.description,
    guide.h1,
    guide.breadcrumb,
    JSON.stringify(guide.blocks),
  ];
  for (const field of fields) {
    const leftover = TOKEN_PATTERN.exec(field);
    if (leftover) {
      throw new Error(`Unfilled guide token ${leftover[0]} in "${guide.slug}"`);
    }
  }
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
  assertNoLeftoverTokens(resolved);
  return resolved;
}

/**
 * Return a copy of the guide with every {{LIVE_COUNT}} clause rephrased so the
 * rendered copy carries no figure and no raw placeholder. Unknown tokens stay
 * a hard error.
 */
export function stripLiveCountFromGuide(guide: Guide): Guide {
  const blocks = stripBlocks(guide.blocks);
  const resolved: Guide = {
    ...guide,
    title: stripLiveCountValue(guide.title),
    description: stripLiveCountValue(guide.description),
    h1: stripLiveCountValue(guide.h1),
    breadcrumb: stripLiveCountValue(guide.breadcrumb),
    blocks,
    faq: extractFaq(blocks),
  };
  assertNoLeftoverTokens(resolved);
  return resolved;
}

/**
 * Resolve the guide with a live count, or fall back to count-free copy when
 * the query fails. Unknown-token throws from the success path are not caught.
 */
export async function resolveGuideWithLiveCount(
  guide: Guide,
  getCount: () => Promise<number>,
): Promise<Guide> {
  if (!guideNeedsLiveCount(guide)) return guide;
  let total: number;
  try {
    total = await getCount();
  } catch {
    console.warn(LIVE_COUNT_UNAVAILABLE_WARN);
    return stripLiveCountFromGuide(guide);
  }
  return substituteLiveCountInGuide(guide, total);
}
