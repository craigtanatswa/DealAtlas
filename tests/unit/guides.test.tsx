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
import { blockCtaPositions, inlineText, parseInline, parseMarkdown, safeHref } from "@/lib/guides/markdown";
import { isKnownGuideSlug } from "@/lib/analytics/events";
import {
  GUIDE_CTA_POSITION_ATTR,
  GUIDE_CTA_TARGET_ATTR,
  guideCtaClickProperties,
  guideCtaTarget,
} from "@/lib/analytics/guide-cta";
import { sanitizeClientEvent } from "@/lib/analytics/sanitize";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { buildRobotsPolicy, guideSitemapEntries } from "@/lib/seo/sitemap";

import { findProtectedMarkerLeaks } from "../helpers/protected-leak";

const ORIGIN = "https://www.dealatlas.uk";
const ROOT = path.resolve(__dirname, "../..");
const SLUG = "how-to-win-council-contracts";
const SLUG_2 = "how-to-find-public-sector-tenders";
const PUBLISHED = [SLUG, SLUG_2];
const UNPUBLISHED_SLUG = "frameworks-and-dynamic-markets";

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
  it("publishes guides #1 and #2 from the repo", () => {
    const guides = listPublishedGuides();
    expect(guides.map((guide) => guide.slug).sort()).toEqual([...PUBLISHED].sort());
    const guide = getPublishedGuide(SLUG)!;
    expect(guide.published).toBe(true);
    expect(guide.path).toBe(`/guides/${SLUG}`);
    expect(guide.title).toBe("How to win council contracts: a UK guide for SMEs");
    expect(guide.h1).toBe("How to win council contracts: a practical guide for SMEs");
    expect(guide.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const second = getPublishedGuide(SLUG_2)!;
    expect(second.published).toBe(true);
    expect(second.path).toBe(`/guides/${SLUG_2}`);
    expect(second.title).toBe("How to find public sector tenders in the UK (2026 guide)");
    expect(second.description).toBe(
      "How to find public sector tenders in the UK: where notices are published, 2026 thresholds, early signals such as pipeline notices, and how to register.",
    );
    expect(second.h1).toBe("How to find public sector tenders in the UK");
    expect(second.updated).toBe("2026-10-19");
  });

  it("drops unpublished guides from lists and lookups (404)", () => {
    expect(listPublishedGuides(fixtureDir).map((guide) => guide.slug)).toEqual(["live-guide"]);
    expect(getPublishedGuide("draft-guide", fixtureDir)).toBeNull();
    expect(getPublishedGuide("live-guide", fixtureDir)?.slug).toBe("live-guide");
    expect(getPublishedGuide(UNPUBLISHED_SLUG)).toBeNull();
  });

  it("returns notFound for an unpublished or unknown guide slug", async () => {
    const { default: GuidePage, dynamicParams, generateStaticParams } = await import(
      "@/app/(marketing)/guides/[slug]/page"
    );
    expect(dynamicParams).toBe(false);
    expect(generateStaticParams().map((param) => param.slug).sort()).toEqual([...PUBLISHED].sort());
    await expect(
      GuidePage({ params: Promise.resolve({ slug: UNPUBLISHED_SLUG }) }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("rejects a guide whose slug and file name differ", () => {
    expect(() => parseGuide(frontmatter("other", true, "2026-01-01"), "live-guide.md")).toThrow(/slug/);
  });

  it.each(PUBLISHED)("%s has no deal links, no header and links only to published guides", (slug) => {
    const source = fs.readFileSync(path.join(GUIDES_DIR, `${slug}.md`), "utf8");
    expect(source).not.toMatch(/\]\(\/deals\/[^)]/);
    expect(source).not.toContain("<!--");
    expect(source).not.toMatch(/HEADER BLOCK|Security clearance|Title tag/);
    const guideLinks = [...source.matchAll(/\]\((\/guides\/[^)#?]+)\)/g)].map((match) => match[1]);
    for (const link of guideLinks) {
      expect(publishedGuidePaths().has(link)).toBe(true);
    }
  });

  it("cross-links guides #1 and #2 and keeps other planned guides as plain text", () => {
    const one = fs.readFileSync(path.join(GUIDES_DIR, `${SLUG}.md`), "utf8");
    const two = fs.readFileSync(path.join(GUIDES_DIR, `${SLUG_2}.md`), "utf8");
    expect(one).toContain(`[how to find public sector tenders](/guides/${SLUG_2})`);
    expect(two).toContain(`[how to win council contracts](/guides/${SLUG})`);
    for (const source of [one, two]) {
      expect(source).not.toMatch(/\]\(\/guides\/(find-a-tender-vs-contracts-finder|procurement-notice-types|frameworks-and-dynamic-markets)/);
    }
    expect(two).toContain("The procurement notice types guide explains");
    expect(two).toContain("The frameworks and dynamic markets guide explains");
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
    expect(html).toContain('href="/guides/how-to-find-public-sector-tenders"');
    expect(html).toContain('href="/guides/how-to-win-council-contracts"');
    const draft = renderToStaticMarkup(
      <GuideMarkdown
        blocks={parseMarkdown(`See [guide five](/guides/${UNPUBLISHED_SLUG}).`)}
        publishedGuidePaths={publishedGuidePaths()}
      />,
    );
    expect(draft).not.toContain(`/guides/${UNPUBLISHED_SLUG}`);
    expect(draft).toContain("guide five");
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

describe("guide #2 JSON-LD", () => {
  const guide = getPublishedGuide(SLUG_2)!;
  const jsonLd = guideJsonLd(ORIGIN, guide) as { "@graph": Array<Record<string, unknown>> };
  const byType = (type: string) => jsonLd["@graph"].find((node) => node["@type"] === type)!;
  const url = `${ORIGIN}/guides/${SLUG_2}`;

  it("emits Article, BreadcrumbList and FAQPage for guide #2", () => {
    expect(jsonLd["@graph"].map((node) => node["@type"])).toEqual(["Article", "BreadcrumbList", "FAQPage"]);
    expect(byType("Article")).toMatchObject({
      "@id": `${url}#article`,
      headline: "How to find public sector tenders in the UK",
      mainEntityOfPage: url,
      dateModified: "2026-10-19",
      image: `${ORIGIN}/brand/dealatlas-logo.png`,
    });
    expect(byType("BreadcrumbList").itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: "Guides", item: `${ORIGIN}/guides` },
      { "@type": "ListItem", position: 3, name: "How to find public sector tenders in the UK", item: url },
    ]);
    const serialized = serializeJsonLd(jsonLd);
    expect(findProtectedMarkerLeaks(serialized)).toEqual([]);
    expect(serialized).not.toContain("/deals/");
  });

  it("uses FAQ answers that match the visible FAQ text verbatim", () => {
    const faq = byType("FAQPage").mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;
    expect(faq.map((item) => item.name)).toEqual([
      "Where are UK public sector tenders published?",
      "Is Find a Tender free to use?",
      "Is Contracts Finder still used?",
      "What is the threshold for advertising a public contract in 2026?",
      "How can I find out about tenders before they are published?",
    ]);
    const visible = visibleText(
      renderToStaticMarkup(<GuideMarkdown blocks={guide.blocks} publishedGuidePaths={publishedGuidePaths()} />),
    );
    const source = fs.readFileSync(path.join(GUIDES_DIR, `${SLUG_2}.md`), "utf8");
    for (const item of faq) {
      expect(visible).toContain(item.name);
      expect(visible).toContain(item.acceptedAnswer.text);
      expect(source).toContain(`### ${item.name}\n\n${item.acceptedAnswer.text}\n`);
    }
  });
});

describe("guide CTA analytics", () => {
  function fakeLink(attrs: Record<string, string>) {
    return {
      closest: (selector: string) =>
        selector.startsWith("a[") && GUIDE_CTA_TARGET_ATTR in attrs
          ? { getAttribute: (name: string) => attrs[name] ?? null }
          : null,
    };
  }

  it.each(PUBLISHED)("marks %s CTA links to /deals and /pricing as end-position CTAs", (slug) => {
    const guide = getPublishedGuide(slug)!;
    const html = renderToStaticMarkup(
      <GuideMarkdown blocks={guide.blocks} publishedGuidePaths={publishedGuidePaths()} />,
    );
    expect(html).toContain(`${GUIDE_CTA_TARGET_ATTR}="deals" ${GUIDE_CTA_POSITION_ATTR}="end" href="/deals"`);
    expect(html).toContain(`${GUIDE_CTA_TARGET_ATTR}="pricing" ${GUIDE_CTA_POSITION_ATTR}="end" href="/pricing"`);
    expect(html).not.toMatch(new RegExp(`${GUIDE_CTA_TARGET_ATTR}="[^"]*" ${GUIDE_CTA_POSITION_ATTR}="[^"]*" href="/categories`));
    expect(html).not.toMatch(/data-guide-cta-[a-z]+="[^"]*(\d{4,}|deal-)/);
  });

  it("classifies only exact CTA paths", () => {
    expect(guideCtaTarget("/deals")).toBe("deals");
    expect(guideCtaTarget("/pricing")).toBe("pricing");
    expect(guideCtaTarget("/signup?next=/deals")).toBe("signup");
    expect(guideCtaTarget("/deals/some-deal-ab12")).toBeNull();
    expect(guideCtaTarget("/categories/technology")).toBeNull();
    expect(guideCtaTarget("https://example.com/deals")).toBeNull();
  });

  it("assigns after_answer, mid and end sections", () => {
    const positions = blockCtaPositions(
      parseMarkdown("Intro\n\n## The short answer\n\nA\n\n## Middle\n\nB\n\n## Track it\n\nC\n\n## FAQ\n\n### Q?\n\nD\n"),
    );
    expect(positions).toEqual(["mid", "after_answer", "after_answer", "mid", "mid", "end", "end", "mid", "mid", "mid"]);
  });

  it.each(PUBLISHED)("builds guide_cta_clicked for %s with only slug, position and target", (slug) => {
    const element = fakeLink({ [GUIDE_CTA_TARGET_ATTR]: "deals", [GUIDE_CTA_POSITION_ATTR]: "end" });
    const properties = guideCtaClickProperties(element, `/guides/${slug}`);
    expect(properties).toEqual({ guide_slug: slug, cta_position: "end", cta_target: "deals" });
    const sanitized = sanitizeClientEvent(
      {
        event: "guide_cta_clicked",
        properties: {
          token: "phc_TestKey0123456789abcdef",
          distinct_id: "0190a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b",
          $current_url: `${ORIGIN}/guides/${slug}`,
          ...properties,
        },
      },
      { origin: ORIGIN },
    );
    expect(sanitized?.properties).toMatchObject({ guide_slug: slug, cta_position: "end", cta_target: "deals" });
    expect(isKnownGuideSlug(slug)).toBe(true);
  });

  it("sends nothing off guide pages, for unknown guides or unlisted values", () => {
    const element = fakeLink({ [GUIDE_CTA_TARGET_ATTR]: "deals", [GUIDE_CTA_POSITION_ATTR]: "end" });
    expect(guideCtaClickProperties(element, "/deals/some-deal-ab12")).toBeNull();
    expect(guideCtaClickProperties(element, `/guides/${UNPUBLISHED_SLUG}`)).toBeNull();
    expect(guideCtaClickProperties(fakeLink({}), `/guides/${SLUG}`)).toBeNull();
    expect(
      guideCtaClickProperties(
        fakeLink({ [GUIDE_CTA_TARGET_ATTR]: "deal-123", [GUIDE_CTA_POSITION_ATTR]: "end" }),
        `/guides/${SLUG}`,
      ),
    ).toBeNull();
    expect(guideCtaClickProperties(null, `/guides/${SLUG}`)).toBeNull();
  });

  it("wires the click listener in the PostHog client", () => {
    const source = fs.readFileSync(path.join(ROOT, "components/analytics/posthog-analytics.tsx"), "utf8");
    expect(source).toContain('"guide_cta_clicked"');
    expect(source).toContain("guideCtaClickProperties");
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

  it("lists both live guides with their content dates", () => {
    const entries = guideSitemapEntries(ORIGIN, listPublishedGuides());
    expect(entries.map((entry) => [entry.url, entry.lastModified])).toEqual(
      expect.arrayContaining([
        [`${ORIGIN}/guides`, "2026-10-19"],
        [`${ORIGIN}/guides/${SLUG}`, "2026-10-19"],
        [`${ORIGIN}/guides/${SLUG_2}`, "2026-10-19"],
      ]),
    );
    expect(entries).toHaveLength(3);
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
