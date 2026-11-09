import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PORTAL_TERMS } from "@/lib/preview/risk";
import { SOURCE_PLATFORM_MARKERS } from "@/lib/redaction/gate-vocabulary";
import { BUYER_NAME_DENYLIST, GUIDE_PORTAL_TERMS } from "@/scripts/guide-lint/leaks";
import {
  buildContext,
  formatFailure,
  guideFiles,
  lintGuideDir,
  lintGuideFile,
  lintGuideSource,
} from "@/scripts/guide-lint/lint";
import { routeExists } from "@/scripts/guide-lint/routes";

const ROOT = path.resolve(__dirname, "../..");
const FIXTURES = path.join(ROOT, "scripts", "__fixtures__", "guides");
const PASS_DIR = path.join(FIXTURES, "pass");
const FAIL_DIR = path.join(FIXTURES, "fail");
const APP_DIR = path.join(ROOT, "app");
const SYNTHETIC_BUYER = "Examplehampton Borough Council";

const ctx = buildContext({ guidesDir: PASS_DIR, appDir: APP_DIR, buyerDenylist: [SYNTHETIC_BUYER] });

/** Every failing fixture and the exact set of rules it must trip (fm-loader: the site loader also rejects it). */
const EXPECTED: Record<string, string[]> = {
  "link-http": ["link-https"],
  "link-host": ["link-host"],
  "link-host-schema-org": ["link-host"],
  "link-host-dealatlas": ["link-host"],
  "link-source-notice": ["link-source-path"],
  "link-source-procurement": ["link-source-path"],
  "link-internal-relative": ["link-internal-relative"],
  "link-internal-route": ["link-internal-route"],
  "link-unpublished-guide": ["link-internal-route"],
  "link-deals-slug": ["link-deals-slug"],
  "link-bad-anchor": ["link-internal-route"],
  "leak-ocds": ["leak-ocds"],
  "leak-notice-id": ["leak-notice-id"],
  "leak-reference": ["leak-reference"],
  "leak-email": ["leak-email"],
  "leak-phone": ["leak-phone"],
  "leak-portal-link": ["leak-portal-link"],
  "leak-buyer": ["leak-buyer"],
  "fm-parse": ["fm-parse"],
  "fm-title": ["fm-title"],
  "fm-description": ["fm-description"],
  "fm-slug": ["fm-loader", "fm-slug"],
  "fm-h1": ["fm-h1", "fm-loader"],
  "fm-primary-keyword": ["fm-primary-keyword"],
  "fm-secondary-keywords": ["fm-secondary-keywords"],
  "fm-date-published": ["fm-date-published", "fm-loader"],
  "fm-updated": ["fm-loader", "fm-updated"],
  "fm-date-modified-alias": ["fm-updated"],
  "fm-related-guides": ["fm-related-guides"],
  "fm-security-cleared": ["fm-security-cleared"],
  "fm-craig-approved": ["fm-craig-approved"],
  "fm-faq": ["fm-faq"],
  "faq-jsonld": ["faq-jsonld"],
};

describe("guide content lint", () => {
  it("passes the valid fixtures, including a schema.org JSON-LD block and /deals", () => {
    expect(guideFiles(PASS_DIR).length).toBeGreaterThan(0);
    expect(lintGuideDir(PASS_DIR, ctx)).toEqual([]);
  });

  it("has an expectation for every failing fixture", () => {
    const names = guideFiles(FAIL_DIR).map((file) => path.basename(file, ".md")).sort();
    expect(names).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [name, rules] of Object.entries(EXPECTED)) {
    it(`catches ${name}`, () => {
      const file = path.join(FAIL_DIR, `${name}.md`);
      const failures = lintGuideFile(file, ctx);
      expect([...new Set(failures.map((failure) => failure.rule))].sort()).toEqual([...rules].sort());
      for (const failure of failures) {
        expect(failure.line).toBeGreaterThan(0);
        expect(formatFailure(failure, ROOT)).toMatch(
          new RegExp(`^scripts/__fixtures__/guides/fail/${name}\\.md:\\d+ \\[[a-z0-9-]+\\] .+`),
        );
      }
    });
  }

  it("reports the line of the offending text", () => {
    const file = path.join(FAIL_DIR, "leak-email.md");
    const line = fs.readFileSync(file, "utf8").split("\n").findIndex((text) => text.includes("@example.com")) + 1;
    expect(lintGuideFile(file, ctx).map((failure) => failure.line)).toEqual([line]);
  });

  it("lets Find a Tender and Contracts Finder links through unless they point at a notice", () => {
    const source = (href: string) =>
      fs.readFileSync(path.join(PASS_DIR, "valid-guide.md"), "utf8").replace("](/pricing)", `](${href})`);
    const rules = (href: string) =>
      lintGuideSource(path.join(PASS_DIR, "valid-guide.md"), source(href), ctx).map((failure) => failure.rule);
    expect(rules("https://www.find-tender.service.gov.uk/Home/NoticeTypes")).toEqual([]);
    expect(rules("https://www.contractsfinder.service.gov.uk/Search/Results")).toEqual([]);
    expect(rules("https://www.find-tender.service.gov.uk/Notice/abc")).toEqual(["link-source-path"]);
    expect(rules("https://www.find-tender.service.gov.uk/notice/abc")).toEqual(["link-source-path"]);
    expect(rules("https://www.contractsfinder.service.gov.uk/Procurement/abc")).toEqual(["link-source-path"]);
  });

  it("builds routes from the app/ tree", () => {
    for (const route of ["/", "/deals", "/pricing", "/guides", "/how-it-works", "/categories"]) {
      expect(routeExists(ctx.routes, route)).toBe(true);
    }
    expect(ctx.routes.dynamicRoutes.map((segments) => segments.join("/"))).toContain("guides/[slug]");
    expect(routeExists(ctx.routes, "/guides/valid-guide")).toBe(true);
    expect(routeExists(ctx.routes, "/guides/draft-guide")).toBe(false);
    expect(routeExists(ctx.routes, "/categories/technology")).toBe(true);
    expect(routeExists(ctx.routes, "/categories/not-a-category")).toBe(false);
    expect(routeExists(ctx.routes, "/deals/road-maintenance-ab12cd34")).toBe(false);
    expect(routeExists(ctx.routes, "/app/deals/123")).toBe(false);
  });

  describe("Craig 27 Oct portal rule", () => {
    const craigSource = (craigApprovedAt: string, body: string) =>
      [
        "---",
        "slug: craig-portal-fixture",
        "published: true",
        'title: "Craig portal fixture"',
        'description: "Fixture for the Craig portal rule."',
        'h1: "Craig portal fixture"',
        'breadcrumb: "Craig portal fixture"',
        "datePublished: 2026-10-27",
        "updated: 2026-10-27",
        'primaryKeyword: "fixture"',
        'secondaryKeywords: ["fixture"]',
        "relatedGuides: []",
        "securityClearedAt: 2026-10-27",
        `craigApprovedAt: ${craigApprovedAt}`,
        "---",
        "",
        body,
        "",
      ].join("\n");

    const craigRules = (source: string) =>
      lintGuideSource(path.join(PASS_DIR, "craig-portal-fixture.md"), source, ctx)
        .map((failure) => failure.rule)
        .filter((rule) => rule.startsWith("craig-"));

    it("bans advice to start on a free portal for guides approved from 27 Oct 2026", () => {
      const source = craigSource(
        "2026-10-27",
        "Start with Find a Tender to find work.\n\nBrowse [live opportunities](/deals).",
      );
      expect(craigRules(source)).toContain("craig-portal-advice");
    });

    it("bans links to free tender source platforms", () => {
      const source = craigSource(
        "2026-10-27",
        "See [search](https://www.find-tender.service.gov.uk/Search).\n\nBrowse [live opportunities](/deals).",
      );
      expect(craigRules(source)).toContain("craig-portal-link");
    });

    it("bans hardcoded live opportunity counts", () => {
      const source = craigSource(
        "2026-10-27",
        "405 live UK opportunities on DealAtlas today.\n\nBrowse [live opportunities](/deals).",
      );
      expect(craigRules(source)).toContain("craig-hardcoded-count");
    });

    it("accepts the published count token and a DealAtlas CTA", () => {
      const source = craigSource(
        "2026-10-27",
        "{{LIVE_COUNT}} live UK opportunities on DealAtlas today.\n\nBrowse [live opportunities](/deals).",
      );
      expect(craigRules(source)).toEqual([]);
    });

    it("grandfathers guides approved before 27 Oct 2026", () => {
      const source = craigSource(
        "2026-10-19",
        "Start with Find a Tender to find work.\n\nBrowse [live opportunities](/deals).",
      );
      expect(craigRules(source)).toEqual([]);
    });
  });

  it("reuses the gate vocabulary for portal names and keeps the buyer hook empty", () => {
    expect(GUIDE_PORTAL_TERMS).toContain("find a tender");
    expect(GUIDE_PORTAL_TERMS).toContain("procontract");
    expect(GUIDE_PORTAL_TERMS).not.toContain("intend");
    expect(GUIDE_PORTAL_TERMS).not.toContain("ted");
    expect(PORTAL_TERMS).toContain("ted");
    expect(SOURCE_PLATFORM_MARKERS).toContain("intend");
    expect(BUYER_NAME_DENYLIST).toEqual([]);
    const defaults = buildContext({ guidesDir: PASS_DIR, appDir: APP_DIR });
    const source = fs.readFileSync(path.join(FAIL_DIR, "leak-buyer.md"), "utf8");
    expect(lintGuideSource(path.join(FAIL_DIR, "leak-buyer.md"), source, defaults)).toEqual([]);
  });
});
