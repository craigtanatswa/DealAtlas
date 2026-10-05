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
    const seo = appliedWaiver(
      { probe_id: "A-SEO-04", pass: false, tokens_present: [], assertions: [{ id: "sitemap", pass: false }] },
      file.waivers,
      now,
    );
    expect(seo?.finding).toBe("SEO-04");
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
