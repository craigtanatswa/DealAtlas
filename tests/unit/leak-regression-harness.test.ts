import { describe, expect, it } from "vitest";

import {
  PROBES_PATH,
  contexts,
  decodeForScan,
  extractViews,
  findTokens,
  isEmptyResult,
  loadWorld,
  maskEcho,
  protectedTokens,
  readJson,
  usedValues,
} from "@/scripts/leak-regression/lib";

type ProbeFile = {
  lists: Record<string, string[]>;
  probes: {
    id: string;
    kind: string;
    actor: string;
    path?: string;
    fn?: string;
    args?: Record<string, unknown>;
    forEach?: string;
    tokens?: string;
    expect?: { mustContain?: string[]; mustNotContain?: string[] };
    expectByPhase?: Record<string, unknown>;
  }[];
};

const world = loadWorld();
const tokens = protectedTokens(world);
const probeFile = readJson<ProbeFile>(PROBES_PATH);
const fakeState = {
  sourceId: "s",
  orgIds: {},
  dealIds: Object.fromEntries(world.deals.map((deal, index) => [deal.key, `deal-${index}`])),
  users: {
    free: { id: "f", email: "f@example.com", password: "x" },
    pro: { id: "p", email: "p@example.com", password: "x" },
  },
};

describe("leak regression fixture world", () => {
  it("covers published, held and non-LOW previews", () => {
    const states = new Set(world.deals.map((deal) => deal.preview.state));
    expect([...states].sort()).toEqual(["held", "non_low", "published"]);
  });

  it("has unique deal keys and preview slugs", () => {
    const keys = world.deals.map((deal) => deal.key);
    const slugs = world.deals.map((deal) => deal.preview.slug);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("marks buyer, supplier, reference, postcode, date and site tokens as protected", () => {
    const categories = new Set(tokens.map((token) => token.category));
    for (const category of [
      "name",
      "aliases",
      "postcode",
      "reference",
      "ocid",
      "notice_identifier",
      "source_url",
      "site_names",
      "dates",
      "contact.email",
      "hidden_preview",
    ]) {
      expect(categories, category).toContain(category);
    }
  });

  it("never treats a published preview's own text as protected", () => {
    for (const deal of world.deals.filter((candidate) => candidate.preview.state === "published")) {
      const text = `${deal.preview.title} ${deal.preview.summary} ${deal.preview.slug}`;
      expect(findTokens(text, tokens), deal.key).toEqual([]);
    }
  });

  it("puts protected tokens in every non-LOW preview so the gate has something to catch", () => {
    for (const deal of world.deals.filter((candidate) => candidate.preview.state === "non_low")) {
      const owned = tokens.filter((token) => token.category !== "hidden_preview");
      expect(findTokens(`${deal.preview.title} ${deal.preview.summary}`, owned).length, deal.key).toBeGreaterThan(0);
    }
  });
});

describe("leak regression token matching", () => {
  it("finds tokens through HTML, JSON and URL encodings and slug or phone variants", () => {
    expect(findTokens("<p>Quellmoor Borough Council</p>", tokens)[0]?.token).toBe("Quellmoor Borough Council");
    expect(findTokens('{"t":"Harrowgate\\u0020Depot"}', tokens).map((m) => m.token)).toContain("Harrowgate Depot");
    expect(findTokens("/deals/harrowgate-depot-works", tokens).map((m) => m.token)).toContain("Harrowgate Depot");
    expect(findTokens("call 01632960412", tokens).map((m) => m.token)).toContain("+44 1632 960412");
    expect(findTokens("q=QX4%209RT", tokens).map((m) => m.token)).toContain("QX4 9RT");
    expect(findTokens("Brindlecote Systems Ltd &amp; partners", tokens).map((m) => m.token)).toContain(
      "Brindlecote Systems Ltd",
    );
  });

  it("matches whole tokens only", () => {
    expect(findTokens("xqbcx QBCD", tokens).map((m) => m.token)).not.toContain("QBC");
    expect(findTokens("ref QBC.", tokens).map((m) => m.token)).toContain("QBC");
  });

  it("decodes entities and escapes", () => {
    expect(decodeForScan("a&amp;b &#x27;c&#39; \\u0026 %2F")).toBe("a&b 'c' & /");
  });

  it("masks only the request's own echoed input", () => {
    const body = '{"filters":{"query":"Saltrey Lock"},"items":[{"t":"Saltrey Lock outstations"}]}';
    const masked = maskEcho(body, ["Saltrey Lock"]);
    expect(masked).not.toContain("Saltrey Lock");
    expect(findTokens(extractViews(body, ["items"]).items, tokens).map((m) => m.token)).toContain("Saltrey Lock");
    expect(maskEcho("value=&quot;Fennick Park&quot;", ["Fennick Park"])).toBe("value=&quot;[[request-echo]]&quot;");
  });

  it("extracts meta and JSON-LD views", () => {
    const html =
      '<title>T</title><meta property="og:title" content="X"><script type="application/ld+json">{"a":1}</script>';
    const views = extractViews(html, ["meta", "jsonld"]);
    expect(views.meta).toContain("og:title");
    expect(views.jsonld).toBe('{"a":1}');
  });

  it("recognises empty RPC results", () => {
    expect(isEmptyResult("[]")).toBe(true);
    expect(isEmptyResult("null")).toBe(true);
    expect(isEmptyResult('[{"slug":"x"}]')).toBe(false);
  });
});

describe("leak regression probe list", () => {
  it("has unique probe ids", () => {
    const ids = probeFile.probes.map((probe) => probe.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every forEach list and placeholder", () => {
    for (const probe of probeFile.probes) {
      const list = contexts(world, fakeState, probeFile.lists, probe.forEach);
      expect(list.length, probe.id).toBeGreaterThan(0);
      const templates = [
        probe.path,
        ...Object.values(probe.args ?? {}).filter((value): value is string => typeof value === "string"),
        ...(probe.expect?.mustContain ?? []),
        ...(probe.expect?.mustNotContain ?? []),
      ];
      for (const template of templates) {
        if (!template) continue;
        const placeholders = [...template.matchAll(/\{([a-zA-Z]+)\}/g)].map((match) => match[1]);
        for (const context of list) {
          expect(usedValues(template, context).length, `${probe.id}: ${template}`).toBe(placeholders.length);
        }
      }
    }
  });

  it("only lets Pro probes see protected tokens", () => {
    for (const probe of probeFile.probes.filter((candidate) => candidate.tokens === "allow")) {
      expect(probe.actor, probe.id).toBe("pro");
    }
  });

  it("covers every public surface the job is meant to probe, in both phases", () => {
    const paths = probeFile.probes.map((probe) => probe.path ?? `rpc:${probe.fn}`);
    for (const surface of [
      "/",
      "/deals",
      "/deals/{slug}",
      "/categories/{categorySlug}",
      "/api/search?q={term}",
      "/sitemap.xml",
      "/deals/sitemap/0.xml",
      "/robots.txt",
      "/app/alerts",
      "/api/alerts",
      "rpc:search_preview_dtos",
      "rpc:get_preview_dto_by_slug",
    ]) {
      expect(paths, surface).toContain(surface);
    }
    expect(probeFile.probes.some((probe) => probe.expectByPhase?.["post-0019"])).toBe(true);
  });
});
