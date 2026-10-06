import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { contextFromPersisted } from "@/ingestion/intelligence/types";
import { generatePreviewDraft } from "@/ingestion/preview/generate";
import { generatePreviewDraftWithGateRetry } from "@/ingestion/preview/publish";
import { persistIntelligenceAndPreview } from "@/ingestion/preview/publish";
import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import type { DealPreviewRecord } from "@/ingestion/store/types";
import { previewSlugHash } from "@/lib/deals/public-slug";
import { jobProcessShouldFail, parseJobArgs } from "@/lib/jobs/cli";
import { rebuildAllPreviews } from "@/lib/jobs/previews";

const ROOT = path.resolve(__dirname, "../..");
const NOW = new Date("2026-09-15T12:00:00.000Z");

function dealId(n: number): string {
  return `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function storeWithSource() {
  return createMemoryIngestionStore({
    sources: [findATenderSourceRecord({ id: "source-fat" })],
  });
}

async function seedDeal(
  store: ReturnType<typeof storeWithSource>,
  n: number,
  preview: {
    isPublished: boolean;
    unpublishedByAdmin?: boolean;
    slug?: string;
    title?: string;
    leakageRisk?: DealPreviewRecord["leakageRisk"];
  },
  source?: {
    sourceTitle?: string;
    reference?: string;
    ocid?: string;
    sourceUrl?: string;
    buyerName?: string;
  },
) {
  const id = dealId(n);
  if (source?.buyerName) {
    store.organizations.push({
      id: `buyer-${n}`,
      canonicalName: source.buyerName,
      normalizedName: source.buyerName.toLowerCase(),
      buyerSector: "PUBLIC",
      website: null,
      domain: null,
      email: null,
      phone: null,
      addressLine1: null,
      city: null,
      region: null,
      postcode: null,
      countryCode: "GB",
      isSme: null,
      isVcse: null,
    });
  }
  await store.createDeal({
    id,
    primarySourceId: "source-fat",
    externalPrimaryId: `ext-${n}`,
    ocid: source?.ocid ?? null,
    reference: source?.reference ?? null,
    sourceTitle: source?.sourceTitle ?? "Zebra notice 88421",
    sourceDescription: null,
    buyerOrganizationId: source?.buyerName ? `buyer-${n}` : null,
    dealType: "PUBLIC_TENDER",
    buyerSector: "PUBLIC",
    stage: "LIVE",
    status: "OPEN",
    mainCategory: "Facilities",
    procurementMethod: null,
    specialRegime: null,
    currency: "GBP",
    valueMinExVat: null,
    valueMaxExVat: null,
    exactValueText: null,
    exactLocationText: null,
    enquiryDeadline: null,
    submissionDeadline: null,
    awardDecisionDate: null,
    contractStartDate: null,
    contractEndDate: null,
    extensionEndDate: null,
    nextProcurementDate: null,
    estimatedRenewalDate: null,
    smeSuitable: null,
    vcseSuitable: null,
    sourceUrl: source?.sourceUrl ?? null,
    applicationUrl: null,
    firstPublishedAt: null,
    latestSourceAt: null,
    lastVerifiedAt: null,
    dataQualityScore: null,
  });
  const row: DealPreviewRecord = {
    dealId: id,
    slug: preview.slug ?? `old-facilities-${n}-aaaaaaa${n}`,
    previewTitle: preview.title ?? "Facilities public tender for a public organisation",
    previewSummary: "A public organisation is seeking facilities through a public tender.",
    dealType: "PUBLIC_TENDER",
    buyerSector: "PUBLIC",
    stage: "LIVE",
    status: "OPEN",
    mainCategory: "Facilities",
    broadRegion: null,
    valueBand: "Unknown",
    deadlineBand: "Unknown",
    durationBand: "Unknown",
    smeSuitability: "UNKNOWN",
    bidComplexity: "UNKNOWN",
    competitionLevel: "UNKNOWN",
    requirementsPreview: [],
    relevanceTags: [],
    freshnessLabel: null,
    leakageRisk: preview.leakageRisk ?? "LOW",
    isPublished: preview.isPublished,
    unpublishedByAdmin: preview.unpublishedByAdmin ?? false,
  };
  store.previews.push(row);
  return id;
}

function stubPreview(id: string, flags: { isPublished: boolean; unpublishedByAdmin?: boolean }): DealPreviewRecord {
  return {
    dealId: id,
    slug: `stub-${id.slice(-4)}`,
    previewTitle: "stub",
    previewSummary: "stub",
    dealType: "PUBLIC_TENDER",
    buyerSector: "PUBLIC",
    stage: "LIVE",
    status: "OPEN",
    mainCategory: null,
    broadRegion: null,
    valueBand: null,
    deadlineBand: null,
    durationBand: null,
    smeSuitability: null,
    bidComplexity: null,
    competitionLevel: null,
    requirementsPreview: [],
    relevanceTags: [],
    freshnessLabel: null,
    leakageRisk: "LOW",
    isPublished: flags.isPublished,
    unpublishedByAdmin: flags.unpublishedByAdmin ?? false,
  };
}

type YamlBlock = { key: string; lines: string[] };

function parseTopLevel(yaml: string): YamlBlock[] {
  const blocks: YamlBlock[] = [];
  let current: YamlBlock | null = null;
  for (const line of yaml.replace(/\r\n/g, "\n").split("\n")) {
    if (line.trim() && !line.trimStart().startsWith("#") && !line.startsWith(" ") && !line.startsWith("\t")) {
      current = { key: line.split(":")[0]?.trim() ?? "", lines: [] };
      blocks.push(current);
      continue;
    }
    current?.lines.push(line);
  }
  return blocks;
}

function keysAt(lines: string[], indent: number): string[] {
  const keys: string[] = [];
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const got = line.match(/^ */)?.[0].length ?? 0;
    if (got !== indent) continue;
    const key = line.trim().split(":")[0];
    if (key) keys.push(key);
  }
  return keys;
}

function fieldDefault(lines: string[], name: string): string | null {
  const index = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed === `${name}:` || trimmed.startsWith(`${name}:`);
  });
  if (index < 0) return null;
  const indent = lines[index]?.match(/^ */)?.[0].length ?? 0;
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor] ?? "";
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const got = line.match(/^ */)?.[0].length ?? 0;
    if (got <= indent) break;
    const trimmed = line.trim();
    if (trimmed.startsWith("default:")) {
      return trimmed.slice("default:".length).trim().replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

describe("full preview rebuild", () => {
  it("selects every held and published preview with no 24h or 100 cap", async () => {
    const store = storeWithSource();
    for (let n = 1; n <= 100; n += 1) {
      store.previews.push(stubPreview(dealId(n), { isPublished: true }));
    }
    store.previews.push(
      stubPreview(dealId(101), { isPublished: false, unpublishedByAdmin: true }),
    );
    const draft = dealId(102);
    store.previews.push(stubPreview(draft, { isPublished: false, unpublishedByAdmin: false }));
    const noPreview = dealId(103);
    await store.createDeal({
      id: noPreview,
      primarySourceId: "source-fat",
      externalPrimaryId: "ext-excluded",
      ocid: null,
      reference: null,
      sourceTitle: "Zebra notice 88421",
      sourceDescription: null,
      buyerOrganizationId: null,
      dealType: "PUBLIC_TENDER",
      buyerSector: "PUBLIC",
      stage: "LIVE",
      status: "OPEN",
      mainCategory: "Facilities",
      procurementMethod: null,
      specialRegime: null,
      currency: "GBP",
      valueMinExVat: null,
      valueMaxExVat: null,
      exactValueText: null,
      exactLocationText: null,
      enquiryDeadline: null,
      submissionDeadline: null,
      awardDecisionDate: null,
      contractStartDate: null,
      contractEndDate: null,
      extensionEndDate: null,
      nextProcurementDate: null,
      estimatedRenewalDate: null,
      smeSuitable: null,
      vcseSuitable: null,
      sourceUrl: null,
      applicationUrl: null,
      firstPublishedAt: null,
      latestSourceAt: null,
      lastVerifiedAt: null,
      dataQualityScore: null,
    });
    await store.insertDataChange({
      dealId: noPreview,
      sourceId: "source-fat",
      changeType: "deadline_change",
      fieldName: "submission_deadline",
      previousValue: null,
      newValue: "2026-10-01",
      material: true,
      occurredAt: "2026-09-15T11:00:00.000Z",
    });

    const firstPage = await store.listPreviewRebuildDealIds({ limit: 100 });
    const secondPage = await store.listPreviewRebuildDealIds({
      afterId: firstPage[firstPage.length - 1],
      limit: 100,
    });
    expect(firstPage).toHaveLength(100);
    expect(secondPage).toEqual([dealId(101), draft]);
    expect([...firstPage, ...secondPage]).not.toContain(noPreview);

    const before = JSON.stringify(store.previews);
    let maintains = 0;
    store.maintainDealsLeakIndex = async () => {
      maintains += 1;
    };
    const result = await rebuildAllPreviews({
      store,
      now: NOW,
      mode: "dry-run",
      batchSize: 100,
    });
    expect(result.selected).toBe(102);
    expect(result.batches.map((batch) => batch.selected)).toEqual([100, 2]);
    expect(result.processed).toBe(0);
    expect(maintains).toBe(0);
    expect(JSON.stringify(store.previews)).toBe(before);
    expect(store.retiredSlugHashes).toEqual([]);
  });

  it("batches, resumes, and does not duplicate slugs or hashes", async () => {
    const store = storeWithSource();
    const ids = [
      await seedDeal(store, 1, { isPublished: true, slug: "old-one-1111aaaa" }),
      await seedDeal(store, 2, { isPublished: true, slug: "old-two-2222bbbb" }),
      await seedDeal(store, 3, { isPublished: true, slug: "old-three-3333cccc" }),
      await seedDeal(store, 4, { isPublished: true, slug: "old-four-4444dddd" }),
    ];
    const originalSlugs = new Map(store.previews.map((item) => [item.dealId, item.slug]));
    let maintains = 0;
    store.maintainDealsLeakIndex = async () => {
      maintains += 1;
    };

    const first = await rebuildAllPreviews({
      store,
      now: NOW,
      mode: "live",
      batchSize: 2,
    });
    expect(first.processed).toBe(4);
    expect(first.batches).toHaveLength(2);
    expect(maintains).toBe(2);
    expect(first.failures).toBe(0);
    for (const id of ids) {
      const preview = store.previews.find((item) => item.dealId === id);
      expect(preview?.slug).not.toBe(originalSlugs.get(id));
      expect(store.retiredSlugHashes.filter((hash) => hash === previewSlugHash(originalSlugs.get(id)!))).toHaveLength(1);
    }

    const afterFirst = new Map(store.previews.map((item) => [item.dealId, item.slug]));
    maintains = 0;
    const resumed = await rebuildAllPreviews({
      store,
      now: NOW,
      mode: "live",
      batchSize: 2,
      cursor: ids[1],
    });
    expect(resumed.processed).toBe(2);
    expect(resumed.selected).toBe(2);
    expect(maintains).toBe(1);
    expect(store.previews.find((item) => item.dealId === ids[0])?.slug).toBe(afterFirst.get(ids[0]));
    expect(store.previews.find((item) => item.dealId === ids[1])?.slug).toBe(afterFirst.get(ids[1]));
    expect(store.previews.find((item) => item.dealId === ids[2])?.slug).toBe(afterFirst.get(ids[2]));

    const retiredBefore = [...store.retiredSlugHashes];
    const slugsBefore = store.previews.map((item) => item.slug);
    await rebuildAllPreviews({ store, now: NOW, mode: "live", batchSize: 2 });
    expect(store.retiredSlugHashes).toEqual(retiredBefore);
    expect(store.previews.map((item) => item.slug)).toEqual(slugsBefore);
    expect(new Set(slugsBefore).size).toBe(slugsBefore.length);
  });

  it("leaves template slugs unchanged on a second full run", async () => {
    const store = storeWithSource();
    await seedDeal(store, 1, { isPublished: true, slug: "legacy-notice-aaaa1111" });
    await seedDeal(store, 2, { isPublished: false, unpublishedByAdmin: true, slug: "legacy-hold-bbbb2222" });
    const first = await rebuildAllPreviews({ store, now: NOW, mode: "live", batchSize: 10 });
    expect(first.processed).toBe(2);
    const slugs = store.previews.map((item) => item.slug);
    const hashes = [...store.retiredSlugHashes];
    expect(slugs).not.toContain("legacy-notice-aaaa1111");
    const second = await rebuildAllPreviews({ store, now: NOW, mode: "live", batchSize: 10 });
    expect(second.processed).toBe(2);
    expect(store.previews.map((item) => item.slug)).toEqual(slugs);
    expect(store.retiredSlugHashes).toEqual(hashes);
  });

  it("does not lift holds or publish", async () => {
    const store = storeWithSource();
    const held = await seedDeal(store, 1, {
      isPublished: false,
      unpublishedByAdmin: true,
      slug: "held-slug-aaaa1111",
    });
    const published = await seedDeal(store, 2, {
      isPublished: true,
      unpublishedByAdmin: false,
      slug: "live-slug-bbbb2222",
    });
    const unpublished = await seedDeal(store, 3, {
      isPublished: false,
      unpublishedByAdmin: false,
      slug: "dark-slug-cccc3333",
      title: "Legacy council notice copy",
      leakageRisk: "HIGH",
    });
    const heldBefore = store.previews.find((item) => item.dealId === held);
    const publishedBefore = store.previews.find((item) => item.dealId === published);
    const darkBefore = { ...store.previews.find((item) => item.dealId === unpublished)! };

    const result = await rebuildAllPreviews({ store, now: NOW, mode: "live", batchSize: 10 });
    expect(result.selected).toBe(3);
    expect(result.processed).toBe(3);

    const heldAfter = store.previews.find((item) => item.dealId === held);
    const publishedAfter = store.previews.find((item) => item.dealId === published);
    const darkAfter = store.previews.find((item) => item.dealId === unpublished);
    expect(heldAfter?.unpublishedByAdmin).toBe(true);
    expect(heldAfter?.isPublished).toBe(false);
    expect(heldAfter?.leakageRisk).toBe("LOW");
    expect(heldAfter?.slug).not.toBe(heldBefore?.slug);
    expect(publishedAfter?.isPublished).toBe(true);
    expect(publishedAfter?.unpublishedByAdmin).toBe(false);
    expect(publishedAfter?.leakageRisk).toBe("LOW");
    expect(publishedAfter?.slug).not.toBe(publishedBefore?.slug);
    expect(darkAfter?.isPublished).toBe(false);
    expect(darkAfter?.unpublishedByAdmin).toBe(false);
    expect(darkAfter?.leakageRisk).toBe("LOW");
    expect(darkAfter?.slug).not.toBe(darkBefore.slug);
    expect(darkAfter?.previewTitle).not.toBe("Legacy council notice copy");

    const source = read("lib/jobs/previews.ts");
    const fn = source.slice(source.indexOf("export async function rebuildAllPreviews"));
    expect(fn).toContain('publication: "preserve"');
    expect(fn).not.toContain("admin_release_preview_hold");

    const autoStore = storeWithSource();
    const autoId = await seedDeal(autoStore, 4, { isPublished: false, unpublishedByAdmin: false });
    const autoDeal = await autoStore.getDealById(autoId);
    const autoContext = await contextFromPersisted({ store: autoStore, deal: autoDeal!, now: NOW });
    const auto = await persistIntelligenceAndPreview({ store: autoStore, context: autoContext! });
    expect(auto.leakageRisk).toBe("LOW");
    expect(autoStore.previews.find((item) => item.dealId === autoId)?.isPublished).toBe(true);

    const keepStore = storeWithSource();
    const keepId = await seedDeal(keepStore, 5, { isPublished: false, unpublishedByAdmin: false });
    const keepDeal = await keepStore.getDealById(keepId);
    const keepContext = await contextFromPersisted({ store: keepStore, deal: keepDeal!, now: NOW });
    const kept = await persistIntelligenceAndPreview({
      store: keepStore,
      context: keepContext!,
      publication: "preserve",
    });
    expect(kept.leakageRisk).toBe("LOW");
    const keptPreview = keepStore.previews.find((item) => item.dealId === keepId);
    expect(keptPreview?.isPublished).toBe(false);
    expect(keptPreview?.unpublishedByAdmin).toBe(false);
  });

  it("dry-run writes no preview rows and logs counts only", async () => {
    const store = storeWithSource();
    const title = "Zebra notice 88421";
    const slug = "kept-slug-ab12cd34";
    const buyer = "Quellmoor Parish Council";
    const sourceUrl = "https://www.find-tender.service.gov.uk/Notice/88421-2026";
    const reference = "REF-ZEBRA-88421";
    const ocid = "ocds-h6vhtk-zebra88421";
    await seedDeal(
      store,
      1,
      { isPublished: true, slug },
      { sourceTitle: title, reference, ocid, sourceUrl, buyerName: buyer },
    );
    const before = {
      previews: JSON.stringify(store.previews),
      insights: store.insights.length,
      runs: store.previewRuns.length,
      hashes: [...store.retiredSlugHashes],
    };
    let maintains = 0;
    store.maintainDealsLeakIndex = async () => {
      maintains += 1;
    };
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    const err = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    const warn = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      const result = await rebuildAllPreviews({ store, now: NOW, mode: "dry-run", batchSize: 10 });
      expect(result.processed).toBe(0);
      expect(result.dryRun).toBe(true);
      expect(result.selected).toBe(1);
      expect(result.risks.LOW + result.risks.REVIEW + result.risks.HIGH).toBe(result.selected);
      expect(result.batches).toHaveLength(1);
      expect(maintains).toBe(0);
      expect(JSON.stringify(store.previews)).toBe(before.previews);
      expect(store.insights).toHaveLength(before.insights);
      expect(store.previewRuns).toHaveLength(before.runs);
      expect(store.retiredSlugHashes).toEqual(before.hashes);
      const logged = lines.join("\n");
      expect(logged).toContain("preview_rebuild_all_batch");
      for (const secret of [title, slug, buyer, sourceUrl, reference, ocid]) {
        expect(logged).not.toContain(secret);
      }
    } finally {
      log.mockRestore();
      err.mockRestore();
      warn.mockRestore();
    }
  });

  it("counts the aggressive gate retry in dry-run", async () => {
    const store = storeWithSource();
    const id = await seedDeal(
      store,
      9,
      { isPublished: false, slug: "retry-slug-aaaa9999" },
      { sourceTitle: "Facilities public tender for a public organisation" },
    );
    const deal = await store.getDealById(id);
    const context = await contextFromPersisted({ store, deal: deal!, now: NOW });
    const first = await generatePreviewDraft(context!);
    const gated = await generatePreviewDraftWithGateRetry(context!);
    expect(first.leakageRisk).not.toBe("LOW");
    expect(gated.attempts).toBe(2);
    const result = await rebuildAllPreviews({ store, now: NOW, mode: "dry-run", batchSize: 10 });
    expect(result.processed).toBe(0);
    expect(result.risks[gated.draft.leakageRisk]).toBe(1);
    expect(result.risks.LOW + result.risks.REVIEW + result.risks.HIGH).toBe(1);
  });

  it("rebuilds a gate-held draft without publishing it", async () => {
    const store = storeWithSource();
    const id = await seedDeal(store, 8, {
      isPublished: false,
      unpublishedByAdmin: false,
      slug: "gate-held-dddd4444",
      title: "Legacy council notice copy",
      leakageRisk: "REVIEW",
    });
    const result = await rebuildAllPreviews({ store, now: NOW, mode: "live", batchSize: 10 });
    const preview = store.previews.find((item) => item.dealId === id);
    expect(result.selected).toBe(1);
    expect(result.processed).toBe(1);
    expect(preview?.isPublished).toBe(false);
    expect(preview?.unpublishedByAdmin).toBe(false);
    expect(preview?.slug).not.toBe("gate-held-dddd4444");
    expect(preview?.previewTitle).not.toBe("Legacy council notice copy");
  });

  it("does not write preview rows unless mode is live", async () => {
    const store = storeWithSource();
    await seedDeal(store, 1, { isPublished: true, slug: "legacy-live-eeee5555" });
    const before = JSON.stringify(store.previews);
    const testRun = await rebuildAllPreviews({ store, now: NOW, mode: "test", batchSize: 10 });
    expect(testRun.dryRun).toBe(true);
    expect(testRun.processed).toBe(0);
    expect(JSON.stringify(store.previews)).toBe(before);
    const implicit = await rebuildAllPreviews({ store, now: NOW, batchSize: 10 });
    expect(implicit.mode).toBe("dry-run");
    expect(implicit.dryRun).toBe(true);
    expect(implicit.processed).toBe(0);
    expect(JSON.stringify(store.previews)).toBe(before);
  });

  it("logs the batch cursor and failing deal id without source text", async () => {
    const store = storeWithSource();
    const title = "Zebra notice 88421";
    const id = await seedDeal(
      store,
      1,
      { isPublished: true, slug: "legacy-log-ffff6666" },
      { sourceTitle: title },
    );
    store.getDealById = async () => {
      throw new Error(title);
    };
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    const err = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      const result = await rebuildAllPreviews({ store, now: NOW, mode: "live", batchSize: 10 });
      expect(result.failures).toBe(1);
      expect(result.processed).toBe(0);
      const logged = lines.join("\n");
      expect(logged).toContain(`"dealId":"${id}"`);
      expect(logged).toContain(`"cursor":"${id}"`);
      expect(logged).not.toContain(title);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  });

  it("defaults the CLI to dry-run and fails a partial preview job", () => {
    const bare = parseJobArgs(["--job", "previews"]);
    expect(bare.mode).toBe("dry-run");
    expect(bare.dryRun).toBe(true);
    expect(bare.all).toBe(false);
    const resumed = parseJobArgs([
      "--job",
      "previews",
      "--all",
      "--mode",
      "live",
      "--after",
      dealId(1),
    ]);
    expect(resumed.all).toBe(true);
    expect(resumed.mode).toBe("live");
    expect(resumed.cursor).toBe(dealId(1));
    expect(jobProcessShouldFail("previews", "PARTIAL")).toBe(true);
    expect(jobProcessShouldFail("data-quality", "PARTIAL")).toBe(false);
    const script = read("scripts/rebuild-previews.ts");
    expect(script).toContain("if (args.all)");
    expect(script).not.toContain("!args.changedSince");
  });
});

describe("rebuild previews workflow", () => {
  it("is dispatch-only, environment-gated, and passes inputs through env", () => {
    const workflow = read(".github/workflows/rebuild-previews.yml");
    const blocks = parseTopLevel(workflow);
    const on = blocks.find((block) => block.key === "on");
    const jobs = blocks.find((block) => block.key === "jobs");
    expect(on).toBeTruthy();
    expect(keysAt(on!.lines, 2)).toEqual(["workflow_dispatch"]);
    expect(keysAt(on!.lines, 2)).not.toContain("schedule");
    expect(workflow).not.toMatch(/^\s*schedule\s*:/m);
    expect(workflow).not.toContain("writes nothing");
    expect(jobs).toBeTruthy();
    expect(keysAt(jobs!.lines, 2)).toEqual(["previews"]);
    const jobText = jobs!.lines.join("\n");
    const stepsAt = jobText.indexOf("\n    steps:");
    const jobHeader = jobText.slice(0, stepsAt);
    expect(jobHeader).toContain("environment: production");
    expect(jobHeader).not.toMatch(/^\s*env:/m);
    expect(jobHeader).not.toContain("SUPABASE_SECRET_KEY");
    const ciAt = jobText.indexOf("run: npm ci");
    const stepAt = jobText.indexOf("- name: Rebuild previews");
    expect(jobText.slice(0, stepAt)).not.toContain("SUPABASE_SECRET_KEY");
    expect(ciAt).toBeGreaterThan(0);
    expect(stepAt).toBeGreaterThan(ciAt);
    const runAt = jobText.indexOf("name: Rebuild previews");
    const runBlock = jobText.slice(runAt);
    const scriptAt = runBlock.indexOf("run: |");
    const runScript = runBlock.slice(scriptAt);
    expect(runBlock.slice(0, scriptAt)).toContain("SUPABASE_SECRET_KEY:");
    expect(runBlock.slice(0, scriptAt)).toContain("MODE: ${{ inputs.mode }}");
    expect(runBlock.slice(0, scriptAt)).toContain("BATCH_SIZE: ${{ inputs.batch_size }}");
    expect(runBlock.slice(0, scriptAt)).toContain("CURSOR: ${{ inputs.cursor }}");
    expect(runScript).not.toContain("${{");
    expect(runScript).toContain("--job previews");
    expect(runScript).toContain("--all");
    expect(runScript).toContain('--mode "$MODE"');
    expect(runScript).toContain('--limit "$BATCH_SIZE"');
    expect(runScript).toContain('--after "$CURSOR"');
    expect(runScript).toContain("dry-run|live");
    expect(runScript).toContain("exit 1");
    expect(runScript).not.toMatch(/--job\s+(ingest|alerts|renewals)/);
    expect(fieldDefault(on!.lines, "mode")).toBe("dry-run");
    expect(fieldDefault(on!.lines, "batch_size")).toBe("100");
    expect(fieldDefault(on!.lines, "cursor")).toBe("");
    expect(read(".github/workflows/scheduled-jobs.yml")).toContain("schedule:");
  });
});

describe("0020 rollback", () => {
  it("drops only the three functions and keeps retired slug hashes", () => {
    const sql = read("supabase/rollback/0020_rollback.sql");
    expect(sql.match(/^\s*begin\s*;/gim)).toHaveLength(1);
    expect(sql.match(/^\s*commit\s*;/gim)).toHaveLength(1);
    expect(sql).toContain("drop function if exists public.preview_slug_is_retired(text);");
    expect(sql).toContain("drop function if exists public.retire_preview_slug(text);");
    expect(sql).toContain("drop function if exists public.maintain_deals_leak_index();");
    expect(sql).toMatch(/alter index public\.deals_leak_source_tsv_idx set \(fastupdate = on\);/);
    expect(sql).not.toMatch(/drop table[\s\S]*retired_preview_slugs/i);
    expect(sql).toMatch(/intentionally kept/i);
  });
});
