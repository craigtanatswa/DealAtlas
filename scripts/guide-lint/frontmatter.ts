import { parseFrontmatter, parseGuide } from "@/lib/guides/content";

import type { GuideLintContext, GuideLintFailure, SourceLine } from "./types";

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

export type FaqEntry = { q: string; a: string };

export type LintedFrontmatter = {
  data: Record<string, string | boolean>;
  faq: FaqEntry[] | null;
};

export function isIsoDate(value: unknown): boolean {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return false;
  return value.length !== 10 || date.toISOString().slice(0, 10) === value;
}

/**
 * Array fields are written as one-line JSON arrays, e.g.
 * `relatedGuides: ["how-to-win-council-contracts"]`, because the site's
 * frontmatter parser (lib/guides/content.ts) reads one `key: value` per line.
 */
function jsonArray(value: unknown): unknown[] | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function lintFrontmatter(
  file: string,
  fileName: string,
  source: string,
  frontmatter: SourceLine[],
  ctx: GuideLintContext,
): { failures: GuideLintFailure[]; parsed: LintedFrontmatter | null } {
  const failures: GuideLintFailure[] = [];
  const lineOf = (key: string) =>
    frontmatter.find((entry) => new RegExp(`^${key}:`).test(entry.text))?.line ?? 1;
  const fail = (key: string, rule: string, message: string) =>
    failures.push({ file, line: lineOf(key), rule, message });

  let data: Record<string, string | boolean>;
  try {
    data = parseFrontmatter(source).data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const bad = /Unsupported frontmatter line: (.*)$/.exec(message)?.[1];
    const line = bad ? (frontmatter.find((entry) => entry.text === bad)?.line ?? 1) : 1;
    failures.push({ file, line, rule: "fm-parse", message });
    return { failures, parsed: null };
  }

  try {
    parseGuide(source, fileName);
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    failures.push({ file, line: 1, rule: "fm-loader", message: `site guide loader rejects this file: ${message}` });
  }

  const title = data.title;
  if (!nonEmptyString(title)) fail("title", "fm-title", "title is required");
  else if (title.length > TITLE_MAX) fail("title", "fm-title", `title is ${title.length} characters (max ${TITLE_MAX})`);

  const description = data.description;
  if (!nonEmptyString(description)) fail("description", "fm-description", "description is required");
  else if (description.length > DESCRIPTION_MAX) {
    fail("description", "fm-description", `description is ${description.length} characters (max ${DESCRIPTION_MAX})`);
  }

  const slug = data.slug;
  if (!nonEmptyString(slug)) fail("slug", "fm-slug", "slug is required");
  else if (!KEBAB.test(slug)) fail("slug", "fm-slug", `slug is not kebab-case: ${slug}`);
  else if (`${slug}.md` !== fileName) fail("slug", "fm-slug", `slug ${slug} does not match file name ${fileName}`);

  if (!nonEmptyString(data.h1)) fail("h1", "fm-h1", "h1 is required");
  if (!nonEmptyString(data.primaryKeyword)) fail("primaryKeyword", "fm-primary-keyword", "primaryKeyword is required");

  if (data.secondaryKeywords === undefined) {
    fail("secondaryKeywords", "fm-secondary-keywords", "secondaryKeywords[] is required");
  } else {
    const list = jsonArray(data.secondaryKeywords);
    if (!list || list.length === 0 || !list.every(nonEmptyString)) {
      fail("secondaryKeywords", "fm-secondary-keywords", "secondaryKeywords must be a non-empty JSON array of strings");
    }
  }

  // `updated` is the single modified date (the loader and JSON-LD dateModified
  // read it). `dateModified` is accepted as an alias and must agree with it.
  const updated = data.updated ?? data.dateModified;
  if (updated === undefined) fail("updated", "fm-updated", "updated is required");
  else if (!isIsoDate(updated)) {
    fail(data.updated !== undefined ? "updated" : "dateModified", "fm-updated", `updated is not an ISO 8601 date: ${String(updated)}`);
  } else if (data.updated !== undefined && data.dateModified !== undefined && data.updated !== data.dateModified) {
    fail("dateModified", "fm-updated", `dateModified (${String(data.dateModified)}) is an alias of updated and must equal it (${String(data.updated)})`);
  }

  for (const [key, rule] of [
    ["datePublished", "fm-date-published"],
    ["craigApprovedAt", "fm-craig-approved"],
  ] as const) {
    if (data[key] === undefined) fail(key, rule, `${key} is required`);
    else if (!isIsoDate(data[key])) fail(key, rule, `${key} is not an ISO 8601 date: ${String(data[key])}`);
  }

  // Optional: guides may ship before a security clearance date exists, but a
  // value that is present must still be an ISO 8601 date.
  if (data.securityClearedAt !== undefined && !isIsoDate(data.securityClearedAt)) {
    fail("securityClearedAt", "fm-security-cleared", `securityClearedAt is not an ISO 8601 date: ${String(data.securityClearedAt)}`);
  }

  if (data.relatedGuides === undefined) {
    fail("relatedGuides", "fm-related-guides", "relatedGuides[] is required");
  } else {
    const list = jsonArray(data.relatedGuides);
    if (!list || !list.every(nonEmptyString)) {
      fail("relatedGuides", "fm-related-guides", "relatedGuides must be a JSON array of guide slugs");
    } else {
      for (const related of list) {
        if (!ctx.publishedGuideSlugs.has(related)) {
          fail("relatedGuides", "fm-related-guides", `related guide is not a published guide: ${related}`);
        }
      }
    }
  }

  let faq: FaqEntry[] | null = null;
  if (data.faq !== undefined) {
    const list = jsonArray(data.faq);
    const valid =
      list &&
      list.length > 0 &&
      list.every(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          nonEmptyString((item as Record<string, unknown>).q) &&
          nonEmptyString((item as Record<string, unknown>).a),
      );
    if (!valid) fail("faq", "fm-faq", "faq must be a non-empty JSON array of {\"q\", \"a\"} strings");
    else faq = (list as Array<Record<string, string>>).map((item) => ({ q: item.q, a: item.a }));
  }

  return { failures, parsed: { data, faq } };
}
