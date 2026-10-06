import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { appliedWaiver, waiverProblems, type Waiver, type WaiverRecord } from "../leak/lib/waiver";

const file = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/leak/waivers.json"), "utf8")) as { waivers: Waiver[] };
const rest13 = file.waivers.find((w) => w.finding === "REST-13")!;
const now = new Date("2026-10-05T00:00:00Z");
const OUTSIDE = ["organization_contacts", "private_opportunity_details", "data_sources", "notices", "award_suppliers"];

function hit(probeId: string, named: string[], code = "PGRST205", extra: Partial<WaiverRecord> = {}): WaiverRecord {
  return {
    probe_id: probeId,
    pass: false,
    tokens_present: [],
    assertions: [
      {
        id: "hint_names_no_private_object",
        pass: false,
        actual: {
          named,
          text: named.map((n) => `Perhaps you meant the table 'public.${n}'`).join(" | "),
          code,
          row: false,
        },
      },
    ],
    ...extra,
  };
}

describe("REST-13 waiver", () => {
  it("is applied to a names-only PGRST205 or PGRST202 hint", () => {
    for (const probeId of ["A-REST-13", "B-REST-13"]) {
      for (const code of ["PGRST205", "PGRST202"]) {
        for (const name of rest13.names!) {
          const waiver = appliedWaiver(hit(probeId, [name], code), file.waivers, now);
          expect(waiver?.finding).toBe("REST-13");
        }
      }
    }
    expect(waiverProblems(file.waivers, now)).toEqual([]);
  });

  it("a different name still fails", () => {
    for (const name of OUTSIDE) {
      expect(appliedWaiver(hit("A-REST-13", [name]), file.waivers, now)).toBeNull();
      expect(appliedWaiver(hit("B-REST-13", ["alerts", name]), file.waivers, now)).toBeNull();
    }
    expect(appliedWaiver(hit("A-REST-13", ["deals"], "PGRST116"), file.waivers, now)).toBeNull();
    expect(
      appliedWaiver(hit("A-REST-13", ["deals"], "PGRST205", { tokens_present: ["T31"] }), file.waivers, now),
    ).toBeNull();
    const rows = hit("A-REST-13", ["alerts"]);
    (rows.assertions[0].actual as { row: boolean }).row = true;
    expect(appliedWaiver(rows, file.waivers, now)).toBeNull();
  });

  it("a different probe id isn't waived", () => {
    for (const probeId of ["A-REST-12", "B-REST-08", "A-SEO-04", "REST-130"]) {
      expect(appliedWaiver(hit(probeId, ["alerts"]), file.waivers, now)?.finding).not.toBe("REST-13");
    }
    expect(appliedWaiver(hit("A-REST-12", ["alerts"]), file.waivers, now)).toBeNull();
    expect(appliedWaiver(seo("A", "chromium", { assertions: [{ id: "sitemap", pass: false }] }), file.waivers, now)).toBeNull();
  });

  it("an expired waiver fails", () => {
    const expired: Waiver = { ...rest13, expires: "2020-01-01" };
    const record = hit("A-REST-13", ["subscriptions"]);
    expect(appliedWaiver(record, [expired], now)).toBeNull();
    expect(waiverProblems([expired], now)).toEqual(["REST-13: expired or invalid expiry"]);
    const unapproved: Waiver = { ...rest13, approved_by: "someone" };
    expect(appliedWaiver(record, [unapproved], now)).toBeNull();
    expect(waiverProblems([unapproved], now)).toEqual(["REST-13: not approved by the Reviewer"]);
  });
});

function seo(phase: "A" | "B", ua: "chromium" | "googlebot", extra: Partial<WaiverRecord> = {}): WaiverRecord {
  return {
    probe_id: `${phase}-SEO-04`,
    role: "anon",
    instance: `deals-sitemap-xml@${ua}`,
    url: "http://127.0.0.1:3000/deals/sitemap.xml",
    pass: false,
    tokens_present: [],
    assertions: [{ id: "xml_or_404", pass: false }],
    ...extra,
  };
}

const scopedSeo: Waiver = {
  finding: "SEO-04",
  scope: {
    role: "anon",
    path: "/deals/sitemap.xml",
    instances: ["deals-sitemap-xml@chromium", "deals-sitemap-xml@googlebot"],
    assertions: ["xml_or_404"],
  },
  reason: "matcher fixture",
  approved_by: "Reviewer",
  expires: "2026-12-31",
};

describe("waiver scope", () => {
  it("never covers a forbidden-token or INTERNAL_ID hit", () => {
    expect(appliedWaiver(seo("A", "chromium", { tokens_present: ["T01"] }), [scopedSeo], now)).toBeNull();
    expect(appliedWaiver(seo("B", "googlebot", { tokens_present: ["T31"] }), [scopedSeo], now)).toBeNull();
    expect(
      appliedWaiver(
        seo("A", "chromium", {
          assertions: [
            { id: "xml_or_404", pass: false },
            { id: "no_forbidden_tokens", pass: false },
          ],
        }),
        [scopedSeo],
        now,
      ),
    ).toBeNull();
    expect(appliedWaiver(hit("A-REST-13", ["alerts"], "PGRST205", { tokens_present: ["T31"] }), file.waivers, now)).toBeNull();
  });

  it("SEO-04 matches only the anon deals-sitemap status and content-type check", () => {
    expect(file.waivers.map((waiver) => waiver.finding)).toEqual(["REST-13"]);
    for (const phase of ["A", "B"] as const) {
      for (const ua of ["chromium", "googlebot"] as const) {
        expect(appliedWaiver(seo(phase, ua), [scopedSeo], now)?.finding).toBe("SEO-04");
      }
    }
    expect(appliedWaiver(seo("A", "chromium", { role: "free" }), [scopedSeo], now)).toBeNull();
    expect(appliedWaiver(seo("A", "chromium", { instance: "sitemap@chromium" }), [scopedSeo], now)).toBeNull();
    expect(appliedWaiver(seo("A", "chromium", { url: "http://127.0.0.1:3000/sitemap.xml" }), [scopedSeo], now)).toBeNull();
    expect(appliedWaiver(seo("A", "chromium", { assertions: [{ id: "slug_union_is_indexable_PUB", pass: false }] }), [scopedSeo], now)).toBeNull();
    expect(
      appliedWaiver(
        seo("A", "googlebot", {
          assertions: [
            { id: "xml_or_404", pass: false },
            { id: "lists_deals_sitemap_xml", pass: false },
          ],
        }),
        [scopedSeo],
        now,
      ),
    ).toBeNull();
  });

  it("a waiver without a scope fails the job", () => {
    const bare: Waiver = {
      finding: "SEO-04",
      reason: "no scope",
      approved_by: "Reviewer",
      expires: "2026-12-31",
    };
    expect(waiverProblems([bare], now)).toEqual(["SEO-04: missing scope"]);
    expect(appliedWaiver(seo("A", "chromium"), [bare], now)).toBeNull();
    expect(waiverProblems(file.waivers, now)).toEqual([]);
  });
});
