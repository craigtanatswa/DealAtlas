import { describe, expect, it } from "vitest";

import {
  compileControl,
  compileTokens,
  controlCounts,
  controlValue,
  decodeLayers,
  forbiddenFor,
  loadManifest,
  reflectionParity,
  scanText,
  type ManifestToken,
} from "../leak/lib/scan";
import { plant, type PlantSite } from "../leak/lib/plant";

const manifest = loadManifest();
const compiled = compileTokens(manifest);
const tokenMap = new Map<string, ManifestToken>(manifest.tokens.map((t) => [t.id, t]));
const forbiddenAnon = (id: string) => forbiddenFor(tokenMap.get(id)!, "anon");

function parity(probeBody: string, controlBody: string | null, requestValue: string) {
  const { spans, control } = controlValue(requestValue, compiled, manifest.controls_alphabet);
  return {
    control,
    verdict: reflectionParity({
      probe: scanText(probeBody, compiled),
      control: controlBody === null ? null : scanText(controlBody, compiled),
      spans,
      tokens: tokenMap,
      forbidden: forbiddenAnon,
    }),
  };
}

function page(query: string, extra = ""): string {
  return `<html><head><title>Search: ${query}</title><meta property="og:description" content="Results for ${query}${extra}"></head><body><input value="${query}"><p>No results for &ldquo;${query}&rdquo;</p></body></html>`;
}

describe("leak scanner decode layers", () => {
  it("decodes entities, JSON escapes, flight chunks, URL encoding, normalisation, squash and base64", () => {
    const flight = `<script>self.__next_f.push([1,"0:{\\"t\\":\\"Zar\\\\u0071well\\"}"])</script>`;
    const layers = decodeLayers(`Z&#97;rqwell ${flight} %5A%61rqwell Zar\u200bqwell ${Buffer.from("Zarqwell Borough Council").toString("base64")}`);
    expect(layers.L1).toContain("Zarqwell");
    expect(layers.L3).toContain("Zarqwell");
    expect(layers.L4).toContain("Zarqwell");
    expect(layers.L5).toContain("zarqwell");
    expect(layers.L6).toContain("zarqwellzarqwell");
    expect(layers.L7).toContain("zarqwell borough council");
  });

  it("finds each encoding of a token in the layer that decodes it", () => {
    const cases: Array<[string, string]> = [
      ["Zarqwell", "L0"],
      ["Z&#x61;rqwell", "L1"],
      ["Zarq\\u0077ell", "L2"],
      ["Zarq%77ell", "L4"],
      ["Ｚａｒｑｗｅｌｌ", "L5"],
      ["Z.a.r.q.w.e.l.l", "L6"],
      [Buffer.from("Quellmoor Depot grounds").toString("base64"), "L7"],
    ];
    for (const [body, layer] of cases) {
      const scan = scanText(`<p>${body}</p>`, compiled);
      const hit = [...scan.tokens.values()].find((t) => t.counts[layer as "L0"]);
      expect(hit, `${body} in ${layer}`).toBeDefined();
    }
  });

  it("counts word-boundary tokens only on boundaries", () => {
    expect(scanText("ZqBC tender", compiled).tokens.get("T02")).toBeDefined();
    expect(scanText("xzqbcx", compiled).tokens.get("T02")).toBeUndefined();
  });
});

describe("reflection parity (spec 4.4)", () => {
  it("passes a pure echo: the token appears exactly as often as the control", () => {
    const q = "Zarqwell";
    const { control, verdict } = parity(page(q), "", q);
    const controlResult = parity(page(q), page(control), q).verdict;
    expect(control).not.toMatch(/zarqwell/i);
    expect(control).toHaveLength(q.length);
    expect(verdict.pass).toBe(false);
    expect(controlResult.pass, JSON.stringify(controlResult)).toBe(true);
  });

  it("fails when the requested token also leaks in a card", () => {
    const q = "Zarqwell";
    const { control } = controlValue(q, compiled, manifest.controls_alphabet);
    const leaked = page(q).replace("</body>", `<article><a href="/deals/x">Grounds for Zarqwell Borough Council</a></article></body>`);
    const verdict = parity(leaked, page(control), q).verdict;
    expect(verdict.pass).toBe(false);
    expect(verdict.rows.some((r) => r.tokenId === "T01" && !r.pass && r.probeCount > r.controlCount)).toBe(true);
  });

  it("fails when the requested token leaks in og:description in another encoding", () => {
    const q = "Quellmoor";
    const { control } = controlValue(q, compiled, manifest.controls_alphabet);
    const leaked = page(q, " at Q&#117;ellmoor Depot");
    const verdict = parity(leaked, page(control), q).verdict;
    expect(verdict.pass).toBe(false);
    expect(verdict.rows.find((r) => r.tokenId === "T16" && r.layer === "L1")?.pass).toBe(false);
  });

  it("fails when the requested token leaks in the RSC payload", () => {
    const q = "Vantrexo";
    const { control } = controlValue(q, compiled, manifest.controls_alphabet);
    const rsc = (term: string, extra: string) =>
      `0:["$","p",null,{"children":"Results for ${term}"}]\n1:{"supplier":"${extra}"}`;
    const verdict = reflectionParity({
      probe: scanText(rsc(q, "Vantrexo Facilities Ltd"), compiled, "text/x-component"),
      control: scanText(rsc(control, ""), compiled, "text/x-component"),
      spans: controlValue(q, compiled, manifest.controls_alphabet).spans,
      tokens: tokenMap,
      forbidden: forbiddenAnon,
    });
    expect(verdict.pass).toBe(false);
  });

  it("counts transformed echoes (slugified, entity-encoded) of controls like the token", () => {
    const q = "Zarqwell Borough Council";
    const { control } = controlValue(q, compiled, manifest.controls_alphabet);
    const render = (term: string) =>
      `<a href="/deals?q=${encodeURIComponent(term)}">${term.replace(/ /g, "&nbsp;")}</a><span>${term.toLowerCase().replace(/ /g, "-")}</span>`;
    expect(parity(render(q), render(control), q).verdict.pass).toBe(true);
  });

  it("fails a forbidden token the request did not carry, whatever the control says", () => {
    const verdict = parity("<p>Results for grounds. Buyer: Zarqwell Borough Council</p>", "<p>Results for grounds.</p>", "grounds").verdict;
    expect(verdict.pass).toBe(false);
    expect(verdict.unreflected.map((u) => u.tokenId)).toContain("T01");
  });

  it("fails every reflected count when no control response exists", () => {
    const verdict = parity(page("Zarqwell"), null, "Zarqwell").verdict;
    expect(verdict.pass).toBe(false);
    expect(verdict.rows.every((r) => !r.pass)).toBe(true);
  });

  it("passes when the control response echoes more often than the probe", () => {
    const q = "Brindlewick";
    const { control } = controlValue(q, compiled, manifest.controls_alphabet);
    expect(parity(`<p>${q}</p>`, `<p>${control}</p><p>${control}</p>`, q).verdict.pass).toBe(true);
  });

  it("builds same-length controls that keep separators and replace UUID prefixes", () => {
    const ref = controlValue("ZQ/PROC/8812", compiled, manifest.controls_alphabet);
    expect(ref.control).toMatch(/^[a-z]{2}\/[a-z]{4}\/[a-z]{4}$/);
    const id = controlValue("/api/deals/5eed0000-0000-4000-8000-0000000000a1", compiled, manifest.controls_alphabet);
    expect(id.control).toBe("/api/deals/c0de0000-0000-4000-8000-0000000000a1");
    expect(id.spans[0].tokenIds.sort()).toEqual(["T31", "T35"]);
  });

  it("counts per token: a second requested token leaking does not hide behind the first one's echo", () => {
    const q = "Zarqwell Quellmoor";
    const { control } = controlValue(q, compiled, manifest.controls_alphabet);
    expect(parity(page(q), page(control), q).verdict.pass).toBe(true);
    const leaked = page(q).replace("</body>", "<p>Quellmoor Depot</p></body>");
    const verdict = parity(leaked, page(control), q).verdict;
    expect(verdict.pass).toBe(false);
    expect(verdict.rows.filter((r) => !r.pass).map((r) => r.tokenId)).toContain("T16");
    expect(verdict.rows.filter((r) => r.tokenId === "T01").every((r) => r.pass)).toBe(true);
  });

  it("counts an @ control that the page echoes as %40", () => {
    const token = manifest.tokens.find((entry) => entry.id === "T04");
    expect(token).toBeDefined();
    const piece = "bjkvxyq@yqbjkvxy.example";
    const counts = controlCounts(decodeLayers(`echo ${piece.replaceAll("@", "%40")}`), compileControl(token!, [piece]));
    expect(counts.L0).toBeGreaterThan(0);
  });

  it("does not match short date and postcode variants inside longer tokens", () => {
    const noise = scanText("5161711516 DFwCzhzE9xNvHgnlH0xwdv", compiled);
    expect(noise.tokens.has("T15")).toBe(false);
    expect(noise.tokens.has("T20")).toBe(false);
    const real = scanText("closes 17/11 near ZE9 7QX (ZE9)", compiled);
    expect(real.tokens.has("T15")).toBe(true);
    expect(real.tokens.has("T20")).toBe(true);
  });

  it("counts a control that keeps separators variantPattern drops", () => {
    const q = "ZQ/PROC/8812";
    const { control } = controlValue(q, compiled, manifest.controls_alphabet);
    expect(control).toContain("/");
    expect(parity(page(q), page(control), q).verdict.pass).toBe(true);
    expect(parity(page("1,234,567"), page(controlValue("1,234,567", compiled, manifest.controls_alphabet).control), "1,234,567").verdict.pass).toBe(true);
    expect(parity(page("17/11"), page(controlValue("17/11", compiled, manifest.controls_alphabet).control), "17/11").verdict.pass).toBe(true);
  });

  it("never masks: every probe-side occurrence is reported with its count", () => {
    const q = "Zarqwell";
    const leaked = page(q) + "<p>Zarqwell</p>";
    const scan = scanText(leaked, compiled);
    expect(scan.tokens.get("T01")?.counts.L0).toBe(5);
    expect(scan.layers.L0).toContain("Zarqwell");
  });
});

describe("PF-07 planted leaks fail parity (offline)", () => {
  const flight = (term: string) =>
    `<script>self.__next_f.push([1,${JSON.stringify(`0:["$","input",null,{"defaultValue":"${term}"}]\n`)}])</script>`;
  const searchPage = (term: string) =>
    `<html><head><title>Deals</title><meta property="og:description" content="Browse public-sector opportunities"/></head><body><main><form><input name="q" value="${term}"></form><p>No results for &ldquo;${term}&rdquo;</p></main>${flight(term)}</body></html>`;
  const notFound = (slug: string) =>
    `<html><head><title>Not found</title><link rel="canonical" href="/deals/${slug}"/></head><body><main><h1>Opportunity not found</h1></main>${flight(slug)}</body></html>`;
  const searchJson = (term: string) =>
    JSON.stringify({ items: [{ slug: "grounds-and-site-services-1f0a0001", previewTitle: "Grounds and site services", previewSummary: "Upkeep." }], total: 1, filters: { query: term } });
  const cases: Array<{ name: string; request: string; render: (t: string) => string; contentType?: string; sites: PlantSite[] }> = [
    { name: "/deals?q=", request: "Zarqwell Borough Council", render: searchPage, sites: ["card", "og:description", "rsc"] },
    { name: "/deals?q= (RSC)", request: "Zarqwell", render: (t) => `0:["$","input",null,{"defaultValue":"${t}"}]\n`, contentType: "text/x-component", sites: ["rsc"] },
    { name: "slug route", request: "quellmoor-depot-gritting-fleet-7b2d4e10", render: notFound, sites: ["card", "og:description", "rsc"] },
    { name: "/api/search", request: "Vantrexo", render: searchJson, contentType: "application/json", sites: ["json-item"] },
  ];
  for (const c of cases) {
    const { spans, control } = controlValue(c.request, compiled, manifest.controls_alphabet);
    const verdict = (body: string) =>
      reflectionParity({
        probe: scanText(body, compiled, c.contentType),
        control: scanText(c.render(control), compiled, c.contentType),
        spans,
        tokens: tokenMap,
        forbidden: forbiddenAnon,
      });
    it(`${c.name}: the echo-only baseline passes`, () => {
      expect(spans.length).toBeGreaterThan(0);
      expect(verdict(c.render(c.request)).pass).toBe(true);
    });
    for (const site of c.sites) {
      it(`${c.name}: the requested token planted in ${site} is detected`, () => {
        const text = spans[0].text;
        const planted = plant(site, c.render(c.request), text, c.contentType);
        expect(planted).not.toBe(c.render(c.request));
        const v = verdict(planted);
        expect(v.pass).toBe(false);
        expect(v.rows.some((r) => !r.pass && r.probeCount > r.controlCount)).toBe(true);
      });
    }
  }
});
