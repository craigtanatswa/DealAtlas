import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deadlineMayPublish, sourceMayPublish, stageMayPublish } from "@/lib/deals/publish-gate";

const sql = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0068_publish_upcoming_early.sql"),
  "utf8",
);

describe("publish gate parity", () => {
  it("matches migration 0068 source, stage and deadline rules", () => {
    expect(sql).toContain("'OPEN_LICENSE'::public.reuse_status");
    expect(sql).toContain("'PERMISSION_GRANTED'::public.reuse_status");
    expect(sql).toContain("'UNKNOWN'::public.reuse_status");
    expect(sql).toContain("s.reuse_status <> 'PROHIBITED'::public.reuse_status");
    expect(sql).not.toContain("scraping_permitted");
    expect(sql).not.toContain("OCDS_API");
    expect(sql).not.toContain("find-a-tender");
    expect(sourceMayPublish({ enabled: true, reuseStatus: "OPEN_LICENSE" })).toBe(true);
    expect(sourceMayPublish({ enabled: true, reuseStatus: "UNKNOWN" })).toBe(true);
    expect(sourceMayPublish({ enabled: true, reuseStatus: "PROHIBITED" })).toBe(false);
    expect(sourceMayPublish({ enabled: false, reuseStatus: "UNKNOWN" })).toBe(false);
    expect(sql).toContain("d.status in ('OPEN', 'CLOSING_SOON')");
    expect(sql).toContain("d.stage = 'LIVE'");
    expect(sql).toContain("dp.stage = 'LIVE'");
    expect(sql).toContain("d.stage in ('PLANNING', 'EARLY')");
    expect(sql).toContain("dp.stage = d.stage");
    expect(stageMayPublish("UPCOMING", "EARLY")).toBe(true);
    expect(stageMayPublish("UPCOMING", "PLANNING")).toBe(true);
    expect(stageMayPublish("OPEN", "LIVE")).toBe(true);
    expect(stageMayPublish("OPEN", "EARLY")).toBe(false);
    expect(stageMayPublish("CLOSING_SOON", "EARLY")).toBe(false);
    expect(stageMayPublish("AWARDED", "CONTRACT")).toBe(false);
    expect(stageMayPublish("AWARDED", "AWARD")).toBe(false);
    expect(stageMayPublish("ACTIVE", "CONTRACT")).toBe(false);
    expect(sql).toContain("d.submission_deadline <= pg_catalog.now() + interval '24 hours'");
    expect(sql).toContain("d.status = 'UPCOMING'::public.deal_status");
    expect(sql).toContain("d.submission_deadline <= pg_catalog.now()");
    const now = new Date("2026-10-14T12:00:00.000Z");
    expect(deadlineMayPublish("OPEN", null, now)).toBe(true);
    expect(deadlineMayPublish("OPEN", new Date("2026-10-13T12:00:00.000Z"), now)).toBe(false);
    expect(deadlineMayPublish("OPEN", new Date("2026-10-15T11:00:00.000Z"), now)).toBe(false);
    expect(deadlineMayPublish("OPEN", new Date("2026-10-16T12:00:00.000Z"), now)).toBe(true);
    expect(deadlineMayPublish("UPCOMING", null, now)).toBe(true);
    expect(deadlineMayPublish("UPCOMING", new Date("2026-10-16T12:00:00.000Z"), now)).toBe(true);
    expect(deadlineMayPublish("UPCOMING", new Date("2026-10-13T12:00:00.000Z"), now)).toBe(false);
  });
});
