import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  extractFaq,
  parseMarkdown,
  type Block,
  type FaqItem,
} from "@/lib/guides/markdown";

/** Guides live as markdown in the repo. Only `published: true` files are served. */
export const GUIDES_DIR = path.join(process.cwd(), "content", "guides");
export const GUIDES_PATH = "/guides";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const frontmatterSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  published: z.boolean(),
  title: z.string().min(1),
  description: z.string().min(1),
  h1: z.string().min(1),
  breadcrumb: z.string().min(1),
  datePublished: z.string().regex(ISO_DATE),
  updated: z.string().regex(ISO_DATE),
});

export type GuideFrontmatter = z.infer<typeof frontmatterSchema>;

export type Guide = GuideFrontmatter & {
  path: string;
  blocks: Block[];
  faq: FaqItem[];
};

function parseScalar(raw: string): string | boolean {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  const quoted = /^"(.*)"$/.exec(value) ?? /^'(.*)'$/.exec(value);
  return quoted ? quoted[1].replace(/\\"/g, '"') : value;
}

export function parseFrontmatter(source: string): {
  data: Record<string, string | boolean>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) {
    throw new Error("Guide is missing a frontmatter block");
  }
  const data: Record<string, string | boolean> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const pair = /^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!pair) {
      throw new Error(`Unsupported frontmatter line: ${line}`);
    }
    data[pair[1]] = parseScalar(pair[2]);
  }
  return { data, body: match[2] };
}

export function parseGuide(source: string, fileName: string): Guide {
  const { data, body } = parseFrontmatter(source);
  const frontmatter = frontmatterSchema.parse(data);
  if (`${frontmatter.slug}.md` !== fileName) {
    throw new Error(`Guide ${fileName} slug does not match its file name`);
  }
  const blocks = parseMarkdown(body);
  return {
    ...frontmatter,
    path: `${GUIDES_PATH}/${frontmatter.slug}`,
    blocks,
    faq: extractFaq(blocks),
  };
}

const cache = new Map<string, Guide[]>();

/** Every guide file, published or not. Use `listPublishedGuides` for anything public. */
function loadAllGuides(dir: string): Guide[] {
  const cached = cache.get(dir);
  if (cached) return cached;
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((file) => file.endsWith(".md")).sort()
    : [];
  const guides = files.map((file) =>
    parseGuide(fs.readFileSync(path.join(dir, file), "utf8"), file),
  );
  if (process.env.NODE_ENV === "production") {
    cache.set(dir, guides);
  }
  return guides;
}

export function listPublishedGuides(dir: string = GUIDES_DIR): Guide[] {
  return loadAllGuides(dir)
    .filter((guide) => guide.published === true)
    .sort((a, b) => b.updated.localeCompare(a.updated) || a.slug.localeCompare(b.slug));
}

export function getPublishedGuide(slug: string, dir: string = GUIDES_DIR): Guide | null {
  return listPublishedGuides(dir).find((guide) => guide.slug === slug) ?? null;
}

export function publishedGuidePaths(dir: string = GUIDES_DIR): Set<string> {
  return new Set(listPublishedGuides(dir).map((guide) => guide.path));
}

/** The /guides index changes when its newest guide changes. */
export function latestGuideUpdate(guides: Array<Pick<Guide, "updated">>): string | null {
  return guides.reduce<string | null>(
    (latest, guide) => (!latest || guide.updated > latest ? guide.updated : latest),
    null,
  );
}

export function formatGuideDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
