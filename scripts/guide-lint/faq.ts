import { extractFaq, parseMarkdown } from "@/lib/guides/markdown";
import type { Guide } from "@/lib/guides/content";
import { guideJsonLd } from "@/lib/guides/json-ld";

import type { FaqEntry } from "./frontmatter";
import type { GuideLintFailure, SourceLine } from "./types";

const LINT_ORIGIN = "https://guide-lint.invalid";

type JsonLdQuestion = { name?: unknown; acceptedAnswer?: { text?: unknown } };

/** FAQPage questions from the page's own JSON-LD builder (lib/guides/json-ld.ts). */
export function faqPageEntries(guide: Guide): FaqEntry[] | null {
  const graph = (guideJsonLd(LINT_ORIGIN, guide)["@graph"] ?? []) as Array<Record<string, unknown>>;
  const page = graph.find((node) => node["@type"] === "FAQPage");
  if (!page) return null;
  return ((page.mainEntity ?? []) as JsonLdQuestion[]).map((question) => ({
    q: String(question.name ?? ""),
    a: String(question.acceptedAnswer?.text ?? ""),
  }));
}

/**
 * When frontmatter has faq[], its text must equal the FAQPage JSON-LD the page
 * emits, word for word and in order. The JSON-LD is built from the visible
 * `## FAQ` section, so this also ties faq[] to the rendered text.
 */
export function lintFaq(
  file: string,
  data: Record<string, string | boolean>,
  body: SourceLine[],
  faq: FaqEntry[] | null,
  faqLine: number,
): GuideLintFailure[] {
  if (!faq) return [];
  const failures: GuideLintFailure[] = [];
  const blocks = parseMarkdown(body.map((line) => line.text).join("\n"));
  const guide = {
    slug: String(data.slug ?? ""),
    published: data.published === true,
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    h1: String(data.h1 ?? ""),
    breadcrumb: String(data.breadcrumb ?? ""),
    datePublished: String(data.datePublished ?? ""),
    updated: String(data.updated ?? ""),
    path: `/guides/${String(data.slug ?? "")}`,
    blocks,
    faq: extractFaq(blocks),
  } satisfies Guide;

  const jsonLd = faqPageEntries(guide);
  if (!jsonLd) {
    return [{ file, line: faqLine, rule: "faq-jsonld", message: "faq[] is set but the page emits no FAQPage JSON-LD (no visible ## FAQ section)" }];
  }
  const rendered = guide.faq.map((item) => ({ q: item.question, a: item.answer }));
  const renderedMatches =
    rendered.length === jsonLd.length && rendered.every((item, i) => item.q === jsonLd[i].q && item.a === jsonLd[i].a);
  if (!renderedMatches) {
    failures.push({ file, line: faqLine, rule: "faq-jsonld", message: "FAQPage JSON-LD does not match the rendered FAQ section" });
  }
  if (faq.length !== jsonLd.length) {
    failures.push({
      file,
      line: faqLine,
      rule: "faq-jsonld",
      message: `faq[] has ${faq.length} entries but FAQPage JSON-LD has ${jsonLd.length}`,
    });
  }
  faq.forEach((item, i) => {
    const target = jsonLd[i];
    if (!target) return;
    if (item.q !== target.q) {
      failures.push({ file, line: faqLine, rule: "faq-jsonld", message: `faq[${i}].q does not match FAQPage question: "${target.q}"` });
    }
    if (item.a !== target.a) {
      failures.push({ file, line: faqLine, rule: "faq-jsonld", message: `faq[${i}].a does not match the FAQPage answer for "${target.q}"` });
    }
  });
  return failures;
}
