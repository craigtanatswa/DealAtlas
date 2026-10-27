// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { DealProCard } from "@/components/deals/deal-pro-card";
import { DealSearchResults } from "@/components/deals/deal-search-results";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import { toPublicDealPreview, type PreviewDtoFields } from "@/lib/search/dto";

afterEach(cleanup);

const NOTICE_ID = "654321-2026";

const TED_ATTRIBUTION_TEXT =
  "Source: Tenders Electronic Daily (TED), Publications Office of the European Union. © European Union. Reused under Commission Decision 2011/833/EU.";

const ROW = {
  slug: "it-services-for-a-public-organisation-deadbeef",
  preview_title: "IT services for a public organisation",
  preview_summary: "A public organisation is procuring IT services.",
  deal_type: "PUBLIC_TENDER",
  buyer_sector: "PUBLIC",
  stage: "LIVE",
  status: "OPEN",
  main_category: "Technology",
  broad_region: "South West England",
  value_band: "£250k–£500k",
  deadline_band: "Within 30 days",
  duration_band: "1–2 years",
  sme_suitability: "HIGH",
  bid_complexity: "MEDIUM",
  competition_level: "UNKNOWN",
  requirements_preview: [
    "financial capacity evidence",
    "source_key: ted",
    "source_name: Tenders Electronic Daily",
    `notice_id: ${NOTICE_ID}`,
    `attribution: ${TED_ATTRIBUTION_TEXT}`,
  ],
  relevance_tags: [],
  freshness_label: null,
  source_key: "ted",
  sourceKey: "ted",
  source: { source_key: "ted", name: "Tenders Electronic Daily" },
  source_name: "Tenders Electronic Daily",
  source_url: `https://ted.europa.eu/notice/${NOTICE_ID}`,
  notice_id: NOTICE_ID,
  noticeIdentifier: NOTICE_ID,
  eu: true,
  isEu: true,
  ted: true,
  attribution: TED_ATTRIBUTION_TEXT,
} as PreviewDtoFields & Record<string, unknown>;

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, keys);
    }
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("TED attribution never reaches free or anonymous surfaces", () => {
  it("renders free components without TED text, notice ids, or source keys", () => {
    const dto = toPublicDealPreview(ROW);

    const html = [
      render(
        <DealPreviewDetail
          deal={dto}
          unlock={{
            mode: "anonymous",
            loginHref: "/login",
            revealHref: "/app",
            returnTo: `/deals/${dto.slug}`,
          }}
        />,
      ).container.innerHTML,
      render(
        <DealPreviewDetail
          deal={dto}
          unlock={{
            mode: "free",
            revealHref: "/app",
            returnTo: `/deals/${dto.slug}`,
          }}
        />,
      ).container.innerHTML,
      render(
        <DealSearchResults
          filters={{ page: 1, limit: 20 }}
          result={{
            items: [{ preview: dto, match: null }],
            total: 1,
            page: 1,
            pageSize: 20,
          }}
        />,
      ).container.innerHTML,
      render(<UnlockPanel mode="anonymous" />).container.innerHTML,
      render(<UnlockPanel mode="free" />).container.innerHTML,
      render(
        <DealProCard mode="anonymous" alertsHref="/app/alerts" />,
      ).container.innerHTML,
      render(<DealProCard mode="free" alertsHref="/app/alerts" />).container
        .innerHTML,
    ].join("\n");

    expect(html).toContain(dto.previewTitle);
    expect(html).not.toMatch(/\bTED\b/);
    expect(html).not.toMatch(/European Union/i);
    expect(html).not.toMatch(/ted\.europa/i);
    expect(html).not.toMatch(/Tenders Electronic Daily/i);
    expect(html).not.toContain(NOTICE_ID);
    expect(JSON.stringify(dto)).not.toContain(NOTICE_ID);
  });

  it("exposes no TED or source keys on the public preview DTO", () => {
    const dto = toPublicDealPreview(ROW);
    const keys = collectKeys(JSON.parse(JSON.stringify(dto)));

    for (const key of [
      "source",
      "sourceKey",
      "source_key",
      "eu",
      "isEu",
      "ted",
      "attribution",
    ]) {
      expect(keys).not.toContain(key);
    }
  });
});

describe("TED attribution source boundary", () => {
  it("is only imported or referenced by the paid detail and the attribution component", () => {
    const componentsDir = path.join(process.cwd(), "components");
    const allowed = new Set([
      "deals/deal-paid-detail.tsx",
      "deals/ted-attribution.tsx",
    ]);

    for (const file of sourceFiles(componentsDir)) {
      const relative = path
        .relative(componentsDir, file)
        .split(path.sep)
        .join("/");
      if (allowed.has(relative)) {
        continue;
      }

      const source = fs.readFileSync(file, "utf8");
      expect(source, relative).not.toContain("ted-attribution");
      expect(source, relative).not.toContain("TED_SOURCE_KEY");
    }
  });
});
