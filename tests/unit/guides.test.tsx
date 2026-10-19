import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";

import { GuideMarkdown } from "@/components/guides/guide-markdown";
import {
  GUIDES_DIR,
  getPublishedGuide,
  listPublishedGuides,
  parseGuide,
  publishedGuidePaths,
} from "@/lib/guides/content";
import { guideJsonLd, guidesIndexJsonLd } from "@/lib/guides/json-ld";
import { inlineText, parseInline, parseMarkdown, safeHref } from "@/lib/guides/markdown";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { buildRobotsPolicy, guideSitemapEntries } from "@/lib/seo/sitemap";

import { findProtectedMarkerLeaks } from "../helpers/protected-leak";

const ORIGIN = "https://www.dealatlas.uk";
const ROOT = path.resolve(__dirname, "../..");
const SLUG = "how-to-win-council-contracts";

function frontmatter(slug: string, published: boolean, updated: string) {
  return [
    "---",
    `slug: ${slug}`,
    `published: ${published}`,
    `title: "Title ${slug}"`,
    `description: "Description ${slug}"`,
    `h1: "Heading ${slug}"`,
    `breadcrumb: "Crumb ${slug}"`,
    "datePublished: 2026-01-01",
    `updated: ${updated}`,
    "---",
    "",
    "Body text.",
    "",
    "## FAQ",
    "",
    "### Question one?",
    "",
    "Answer one.",
    "",
  ].join("\n");
}

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "guides-"));
fs.writeFileSync(path.join(fixtureDir, "live-guide.md"), frontmatter("live-guide", true, "2026-03-04"));
fs.writeFileSync(path.join(fixtureDir, "draft-guide.md"), frontmatter("draft-guide", false, "2026-09-09"));

afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

function decodeEntities(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function visibleText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
}

describe("guide content", () => {
  it("publishes only guide #1 from the repo", () => {
    const guides = listPublishedGuides();
    expect(guides.map((guide) => guide.slug)).toEqual([SLUG]);
    expect(fs.existsSync(path.join(GUIDES_DIR, "how-to-find-public-sector-tenders.md"))).toBe(false);
    const guide = guides[0];
    expect(guide.published).toBe(true);
    expect(guide.path).toBe(`/guides/${SLUG}`);
    expect(guide.title).toBe("How to win council contracts: a UK guide for SMEs");
    expect(guide.h1).toBe("How to win council contracts: a practical guide for SMEs");
    expect(guide.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("drops unpublished guides from lists and lookups (404)", () => {
    expect(listPublishedGuides(fixtureDir).map((guide) => guide.slug)).toEqual(["live-guide"]);
    expect(getPublishedGuide("draft-guide", fixtureDir)).toBeNull();
    expect(getPublishedGuide("live-guide", fixtureDir)?.slug).toBe("live-guide");
    expect(getPublishedGuide("how-to-find-public-sector-tenders")).toBeNull();
  });

  it("returns notFound for an unpublished or unknown guide slug", async () => {
    const { default: GuidePage, dynamicParams, generateStaticParams } = await import(
      "@/app/(marketing)/guides/[slug]/page"
    );
    expect(dynamicParams).toBe(false);
    expect(generateStaticParams()).toEqual([{ slug: SLUG }]);
    await expect(
      GuidePage({ params: Promise.resolve({ slug: "how-to-find-public-sector-tenders" }) }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("rejects a guide whose slug and file name differ", () => {
    expect(() => parseGuide(frontmatter("other", true, "2026-01-01"), "live-guide.md")).toThrow(/slug/);
  });

  it("contains no deal links and no links to unpublished guides", () => {
    const source = fs.readFileSync(path.join(GUIDES_DIR, `${SLUG}.md`), "utf8");
    expect(source).not.toMatch(/\]\(\/deals\/[^)]/);
    expect(source).not.toMatch(/\]\(\/guides\//);
    expect(source).not.toContain("<!--");
  });
});

describe("guide markdown sanitising", () => {
  it("never emits raw HTML or script from markdown", () => {
    const blocks = parseMarkdown(
      [
        "<script>alert(1)</script>",
        "",
        '<img src=x onerror="alert(1)">',
        "",
        "<!-- hidden note -->",
        "[bad](javascript:alert(1)) and [data](data:text/html,hi) and [ok](/pricing)",
        "",
        "- [proto](//evil.example) item",
      ].join("\n"),
    );
    const html = renderToStaticMarkup(
      <GuideMarkdown blocks={blocks} publishedGuidePaths={new Set()} />,
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toContain("hidden note");
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toMatch(/href="data:/i);
    expect(html).not.toContain('href="//evil.example"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('href="/pricing"');
  });

  it("allows only safe link targets", () => {
    expect(safeHref("https://www.gov.uk/x")).toBe("https://www.gov.uk/x");
    expect(safeHref("/deals")).toBe("/deals");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(inlineText(parseInline("a [b](/c) **d**"))).toBe("a b d");
  });

  it("renders links to unpublished guides as plain text", () => {
    const blocks = parseMarkdown(
      "See [guide two](/guides/how-to-find-public-sector-tenders) and [guide one](/guides/how-to-win-council-contracts).",
    );
    const html = renderToStaticMarkup(
      <GuideMarkdown blocks={blocks} publishedGuidePaths={publishedGuidePaths()} />,
    );
    expect(html).not.toContain("/guides/how-to-find-public-sector-tenders");
    expect(html).toContain("guide two");
    expect(html).toContain('href="/guides/how-to-win-council-contracts"');
  });

  it("keeps the thresholds table as an HTML table and body headings below H1", () => {
    const guide = getPublishedGuide(SLUG)!;
    const html = renderToStaticMarkup(
      <GuideMarkdown blocks={guide.blocks} publishedGuidePaths={publishedGuidePaths()} />,
    );
    expect(html).toContain("<table");
    expect(html).toContain("£5,193,000");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain('href="/deals/');
  });
});

describe("guide JSON-LD", () => {
  const guide = getPublishedGuide(SLUG)!;
  const jsonLd = guideJsonLd(ORIGIN, guide) as { "@context": string; "@graph": Array<Record<string, unknown>> };
  const byType = (type: string) => jsonLd["@graph"].find((node) => node["@type"] === type)!;

  it("emits Article, BreadcrumbList and FAQPage with self-referencing URLs", () => {
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@graph"].map((node) => node["@type"])).toEqual(["Article", "BreadcrumbList", "FAQPage"]);
    const url = `${ORIGIN}/guides/${SLUG}`;
    expect(byType("Article")).toMatchObject({
      "@id": `${url}#article`,
      headline: guide.h1,
      description: guide.description,
      inLanguage: "en-GB",
      mainEntityOfPage: url,
      datePublished: guide.datePublished,
      dateModified: guide.updated,
      author: { "@type": "Organization", name: "DealAtlas", url: `${ORIGIN}/` },
      publisher: { "@type": "Organization", name: "DealAtlas", logo: { "@type": "ImageObject" } },
      image: `${ORIGIN}/brand/dealatlas-logo.png`,
    });
    expect(byType("BreadcrumbList").itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: "Guides", item: `${ORIGIN}/guides` },
      { "@type": "ListItem", position: 3, name: "How to win council contracts", item: url },
    ]);
    const serialized = serializeJsonLd(jsonLd);
    expect(findProtectedMarkerLeaks(serialized)).toEqual([]);
    expect(serialized).not.toContain("/deals/");
  });

  it("uses FAQ answers that match the visible FAQ text verbatim", () => {
    const faq = byType("FAQPage").mainEntity as Array<{
      name: string;
      acceptedAnswer: { "@type": string; text: string };
    }>;
    expect(faq).toHaveLength(5);
    const html = renderToStaticMarkup(
      <GuideMarkdown blocks={guide.blocks} publishedGuidePaths={publishedGuidePaths()} />,
    );
    const visible = visibleText(html);
    const source = fs.readFileSync(path.join(GUIDES_DIR, `${SLUG}.md`), "utf8");
    for (const item of faq) {
      expect(item.acceptedAnswer["@type"]).toBe("Answer");
      expect(visible).toContain(item.name);
      expect(visible).toContain(item.acceptedAnswer.text);
      expect(source).toContain(`### ${item.name}\n\n${item.acceptedAnswer.text}\n`);
    }
    expect(faq[0].name).toBe("Do I need to register on Find a Tender to bid for council contracts?");
  });

  it("lists published guides on the index", () => {
    const index = guidesIndexJsonLd(ORIGIN, { name: "Guides", description: "d", guides: [guide] });
    expect(JSON.stringify(index)).toContain(`${ORIGIN}/guides/${SLUG}`);
  });
});

describe("guide sitemap and robots", () => {
  it("uses the guide's updated date as lastmod and adds no deal URLs", () => {
    const entries = guideSitemapEntries(ORIGIN, listPublishedGuides(fixtureDir));
    expect(entries).toEqual([
      expect.objectContaining({ url: `${ORIGIN}/guides`, lastModified: "2026-03-04" }),
      expect.objectContaining({ url: `${ORIGIN}/guides/live-guide`, lastModified: "2026-03-04" }),
    ]);
    expect(entries.some((entry) => entry.url.includes("draft-guide"))).toBe(false);
    expect(entries.some((entry) => entry.url.includes("/deals"))).toBe(false);
  });

  it("lists the real guide with its frontmatter date, not build time", () => {
    const guide = getPublishedGuide(SLUG)!;
    const entries = guideSitemapEntries(ORIGIN, listPublishedGuides());
    const entry = entries.find((item) => item.url === `${ORIGIN}/guides/${SLUG}`);
    expect(entry?.lastModified).toBe(guide.updated);
    const today = new Date().toISOString().slice(0, 10);
    if (guide.updated !== today) {
      expect(entries.every((item) => item.lastModified !== today)).toBe(true);
    }
    expect(fs.readFileSync(path.join(ROOT, "app/sitemap.ts"), "utf8")).toContain("guideSitemapEntries");
  });

  it("emits no sitemap entries when nothing is published", () => {
    expect(guideSitemapEntries(ORIGIN, [])).toEqual([]);
  });

  it("drops Host from robots and never disallows /guides", () => {
    const robots = buildRobotsPolicy(ORIGIN);
    expect(robots.host).toBeUndefined();
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    for (const rule of rules) {
      const disallow = [rule.disallow ?? []].flat();
      expect(disallow.some((entry) => "/guides".startsWith(entry.replace(/\/$/, "")) && entry !== "")).toBe(false);
    }
  });
});

describe("guide analytics", () => {
  it("adds no custom analytics events carrying deal IDs or slugs", () => {
    const files = [
      "app/(marketing)/guides/page.tsx",
      "app/(marketing)/guides/[slug]/page.tsx",
      "components/guides/guide-markdown.tsx",
    ].map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"));
    for (const source of files) {
      expect(source).not.toMatch(/gtag|dataLayer|publicAnalyticsContext|previewSlug|dealId/);
    }
  });
});
