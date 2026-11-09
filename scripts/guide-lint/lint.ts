import fs from "node:fs";
import path from "node:path";

import { parseFrontmatter } from "@/lib/guides/content";

import { lintCraigPortalRule } from "./craig-portal-rule";
import { lintFaq } from "./faq";
import { lintFrontmatter } from "./frontmatter";
import { BUYER_NAME_DENYLIST, lintLeaks } from "./leaks";
import { lintLinks } from "./links";
import { buildRouteTable } from "./routes";
import { splitGuide } from "./source";
import type { GuideLintContext, GuideLintFailure } from "./types";

export type { GuideLintContext, GuideLintFailure } from "./types";

export function guideFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => path.join(dir, name));
}

/** Slugs of `published: true` guides, read with the site's own frontmatter parser. */
export function publishedGuideSlugs(dir: string): Set<string> {
  const slugs = new Set<string>();
  for (const file of guideFiles(dir)) {
    try {
      const { data } = parseFrontmatter(fs.readFileSync(file, "utf8"));
      if (data.published === true && typeof data.slug === "string" && `${data.slug}.md` === path.basename(file)) {
        slugs.add(data.slug);
      }
    } catch {
      // Unparseable files are reported by lintGuideSource.
    }
  }
  return slugs;
}

export function buildContext(input: {
  guidesDir: string;
  appDir: string;
  buyerDenylist?: readonly string[];
  extraPublishedSlugs?: Iterable<string>;
}): GuideLintContext {
  const slugs = publishedGuideSlugs(input.guidesDir);
  for (const slug of input.extraPublishedSlugs ?? []) slugs.add(slug);
  return {
    publishedGuideSlugs: slugs,
    routes: buildRouteTable(input.appDir, slugs),
    buyerDenylist: input.buyerDenylist ?? BUYER_NAME_DENYLIST,
  };
}

export function lintGuideSource(file: string, source: string, ctx: GuideLintContext): GuideLintFailure[] {
  const split = splitGuide(source);
  if (!split) {
    return [{ file, line: 1, rule: "fm-parse", message: "guide is missing a --- frontmatter block" }];
  }
  const { failures: fmFailures, parsed } = lintFrontmatter(file, path.basename(file), source, split.frontmatter, ctx);
  const failures = [
    ...fmFailures,
    ...lintLinks(file, split.body, ctx),
    ...lintLeaks(file, split.frontmatter, split.body, ctx),
  ];
  if (parsed) {
    const faqLine = split.frontmatter.find((entry) => entry.text.startsWith("faq:"))?.line ?? 1;
    failures.push(...lintFaq(file, parsed.data, split.body, parsed.faq, faqLine));
    failures.push(...lintCraigPortalRule(file, split.frontmatter, split.body, parsed.data));
  }
  return failures.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

export function lintGuideFile(file: string, ctx: GuideLintContext): GuideLintFailure[] {
  return lintGuideSource(file, fs.readFileSync(file, "utf8"), ctx);
}

export function lintGuideDir(dir: string, ctx: GuideLintContext): GuideLintFailure[] {
  return guideFiles(dir).flatMap((file) => lintGuideFile(file, ctx));
}

export function formatFailure(failure: GuideLintFailure, root: string = process.cwd()): string {
  return `${path.relative(root, failure.file)}:${failure.line} [${failure.rule}] ${failure.message}`;
}
