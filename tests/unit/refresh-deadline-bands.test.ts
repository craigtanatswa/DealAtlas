import { describe, expect, it } from "vitest";

import { DEADLINE_BANDS } from "@/lib/preview/bands";
import {
  liveDeadlineBand,
  refreshDeadlineBands,
  type BandRefreshClient,
} from "@/lib/jobs/refresh-deadline-bands";

type FakePreview = {
  deal_id: string;
  deadline_band: string | null;
  is_published: boolean;
  preview_summary?: string | null;
  requirements_preview?: unknown;
};

type FakeDeal = {
  id: string;
  submission_deadline: string | null;
  status: string | null;
};

function fakeClient(input: {
  previews: FakePreview[];
  deals: FakeDeal[];
  gate?: (dealId: string) => boolean;
  errorOn?: "previews" | "deals" | "update";
}) {
  const updates: Array<{
    band: string;
    ids: string[];
    summary?: string;
    requirements?: unknown[];
  }> = [];
  const selects: Array<{ table: string; columns: string }> = [];
  const pages: Array<{ after: string | null; count: number }> = [];

  const client = {
    from(table: string) {
      if (table === "deals") {
        return {
          select(columns: string) {
            selects.push({ table, columns });
            return {
              async in(_column: string, ids: readonly string[]) {
                if (input.errorOn === "deals") {
                  return { data: null, error: { message: "deals failed" } };
                }
                return {
                  data: input.deals.filter((deal) => ids.includes(deal.id)),
                  error: null,
                };
              },
            };
          },
        };
      }
      return {
        select(columns: string) {
          selects.push({ table, columns });
          return {
            eq(_column: string, value: boolean) {
              return {
                order() {
                  const page = (after: string | null) => ({
                    async limit(count: number) {
                      pages.push({ after, count });
                      if (input.errorOn === "previews") {
                        return { data: null, error: { message: "previews failed" } };
                      }
                      return {
                        data: input.previews
                          .filter((preview) => preview.is_published === value)
                          .filter((preview) => after === null || preview.deal_id > after)
                          .sort((a, b) => a.deal_id.localeCompare(b.deal_id))
                          .slice(0, count)
                          .map((preview) => ({
                            deal_id: preview.deal_id,
                            deadline_band: preview.deadline_band,
                            preview_summary: preview.preview_summary ?? null,
                            requirements_preview: preview.requirements_preview ?? [],
                          })),
                        error: null,
                      };
                    },
                  });
                  return {
                    ...page(null),
                    gt(_column: string, after: string) {
                      return page(after);
                    },
                  };
                },
              };
            },
          };
        },
        update(values: {
          deadline_band: string;
          preview_summary?: string;
          requirements_preview?: unknown[];
        }) {
          const apply = (
            id: string,
            value: boolean,
          ): { deal_id: string; is_published: boolean } | null => {
            const preview = input.previews.find(
              (row) => row.deal_id === id && row.is_published === value,
            );
            if (!preview) {
              return null;
            }
            preview.deadline_band = values.deadline_band;
            if (values.preview_summary !== undefined) {
              preview.preview_summary = values.preview_summary;
            }
            if (values.requirements_preview !== undefined) {
              preview.requirements_preview = values.requirements_preview;
            }
            if (input.gate?.(id)) {
              preview.is_published = false;
            }
            return {
              deal_id: id,
              is_published: preview.is_published,
            };
          };
          return {
            in(_column: string, ids: readonly string[]) {
              return {
                eq(_column2: string, value: boolean) {
                  return {
                    async select() {
                      if (input.errorOn === "update") {
                        return { data: null, error: { message: "update failed" } };
                      }
                      updates.push({
                        band: values.deadline_band,
                        ids: [...ids],
                        summary: values.preview_summary,
                        requirements: values.requirements_preview,
                      });
                      const data: Array<{
                        deal_id: string;
                        is_published: boolean;
                      }> = [];
                      for (const id of ids) {
                        const row = apply(id, value);
                        if (row) {
                          data.push(row);
                        }
                      }
                      return { data, error: null };
                    },
                  };
                },
              };
            },
            eq(_column: string, id: string) {
              return {
                eq(_column2: string, value: boolean) {
                  return {
                    async select() {
                      if (input.errorOn === "update") {
                        return { data: null, error: { message: "update failed" } };
                      }
                      updates.push({
                        band: values.deadline_band,
                        ids: [id],
                        summary: values.preview_summary,
                        requirements: values.requirements_preview,
                      });
                      const row = apply(id, value);
                      return {
                        data: row ? [row] : [],
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    client: client as unknown as BandRefreshClient,
    updates,
    selects,
    pages,
  };
}

describe("live deadline bands", () => {
  it("derives the band from a deadline ten days away", () => {
    expect(
      liveDeadlineBand({
        deadline: "2026-11-19T12:00:00.000Z",
        status: "OPEN",
        now: new Date("2026-11-09T12:00:00.000Z"),
      }),
    ).toBe("Within 14 days");
  });

  it("keeps unknown, invalid and past deadlines out of the update plan", () => {
    const now = new Date("2026-11-09T12:00:00.000Z");
    expect(
      liveDeadlineBand({ deadline: null, status: "OPEN", now }),
    ).toBeNull();
    expect(
      liveDeadlineBand({ deadline: "not-a-date", status: "OPEN", now }),
    ).toBeNull();
    expect(
      liveDeadlineBand({
        deadline: "2026-11-01T12:00:00.000Z",
        status: "OPEN",
        now,
      }),
    ).toBeNull();
  });
});

describe("refreshDeadlineBands", () => {
  it("crosses a band boundary without a preview rebuild", async () => {
    const previews: FakePreview[] = [
      {
        deal_id: "deal-1",
        deadline_band: "Within 30 days",
        is_published: true,
      },
    ];
    const deals: FakeDeal[] = [
      {
        id: "deal-1",
        submission_deadline: "2026-11-25T12:00:00.000Z",
        status: "OPEN",
      },
    ];

    const before = fakeClient({ previews, deals });
    const unchanged = await refreshDeadlineBands({
      client: before.client,
      now: new Date("2026-11-09T12:00:00.000Z"),
      apply: true,
    });
    expect(unchanged).toMatchObject({ scanned: 1, stale: 0, updated: 0 });
    expect(before.updates).toEqual([]);

    const crossing = fakeClient({ previews, deals });
    const changed = await refreshDeadlineBands({
      client: crossing.client,
      now: new Date("2026-11-11T00:30:00.000Z"),
      apply: true,
    });
    expect(changed).toMatchObject({ scanned: 1, stale: 1, updated: 1 });
    expect(changed.byBand).toEqual({ "Within 14 days": 1 });
    expect(previews[0]?.deadline_band).toBe("Within 14 days");

    const repeat = fakeClient({ previews, deals });
    const idempotent = await refreshDeadlineBands({
      client: repeat.client,
      now: new Date("2026-11-11T00:30:00.000Z"),
      apply: true,
    });
    expect(idempotent).toMatchObject({ scanned: 1, stale: 0, updated: 0 });
    expect(repeat.updates).toEqual([]);
  });

  it("rewrites stale closing-window text even when the band is current", async () => {
    const previews: FakePreview[] = [
      {
        deal_id: "deal-text",
        deadline_band: "Within 3 days",
        is_published: true,
        preview_summary:
          "A public organisation is procuring IT. Closing window Within 14 days.",
        requirements_preview: [
          "scope: Work for a public organisation.",
          "keyDates: Closing window Within 14 days. Contract term 1–2 years",
        ],
      },
    ];
    const deals: FakeDeal[] = [
      {
        id: "deal-text",
        submission_deadline: "2026-11-11T12:00:00.000Z",
        status: "OPEN",
      },
    ];
    const fake = fakeClient({ previews, deals });
    const result = await refreshDeadlineBands({
      client: fake.client,
      now: new Date("2026-11-09T12:00:00.000Z"),
      apply: true,
    });

    expect(result).toMatchObject({
      scanned: 1,
      stale: 1,
      updated: 1,
      textRewritten: 1,
    });
    expect(result.byBand).toEqual({ "Within 3 days": 1 });
    expect(previews[0]?.deadline_band).toBe("Within 3 days");
    expect(previews[0]?.preview_summary).toContain(
      "Closing window Within 3 days",
    );
    expect(previews[0]?.preview_summary).not.toContain("Within 14 days");
    expect(previews[0]?.requirements_preview).toEqual([
      "scope: Work for a public organisation.",
      "keyDates: Closing window Within 3 days. Contract term 1–2 years",
    ]);
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]?.ids).toEqual(["deal-text"]);
  });

  it("updates both the band and stale text when they differ", async () => {
    const previews: FakePreview[] = [
      {
        deal_id: "deal-both",
        deadline_band: "Within 30 days",
        is_published: true,
        preview_summary: "Closing window Within 30 days.",
        requirements_preview: ["keyDates: Closing window Within 30 days"],
      },
    ];
    const deals: FakeDeal[] = [
      {
        id: "deal-both",
        submission_deadline: "2026-11-11T12:00:00.000Z",
        status: "OPEN",
      },
    ];
    const fake = fakeClient({ previews, deals });
    const result = await refreshDeadlineBands({
      client: fake.client,
      now: new Date("2026-11-09T12:00:00.000Z"),
      apply: true,
    });

    expect(result).toMatchObject({
      scanned: 1,
      stale: 1,
      updated: 1,
      textRewritten: 1,
    });
    expect(previews[0]?.deadline_band).toBe("Within 3 days");
    expect(previews[0]?.preview_summary).toBe(
      "Closing window Within 3 days.",
    );
    expect(previews[0]?.requirements_preview).toEqual([
      "keyDates: Closing window Within 3 days",
    ]);
  });

  it("treats non-array requirements as unchanged", async () => {
    const previews: FakePreview[] = [
      {
        deal_id: "deal-non-array",
        deadline_band: "Within 3 days",
        is_published: true,
        preview_summary: "Closing window Within 14 days.",
        requirements_preview: "not-an-array",
      },
    ];
    const deals: FakeDeal[] = [
      {
        id: "deal-non-array",
        submission_deadline: "2026-11-11T12:00:00.000Z",
        status: "OPEN",
      },
    ];
    const fake = fakeClient({ previews, deals });
    const result = await refreshDeadlineBands({
      client: fake.client,
      now: new Date("2026-11-09T12:00:00.000Z"),
      apply: true,
    });

    expect(result).toMatchObject({ stale: 1, updated: 1, textRewritten: 1 });
    expect(previews[0]?.requirements_preview).toBe("not-an-array");
    expect(fake.updates[0]?.requirements).toBeUndefined();
  });

  it("keeps non-string requirements preview elements in place", async () => {
    const previews: FakePreview[] = [
      {
        deal_id: "deal-mixed",
        deadline_band: "Within 3 days",
        is_published: true,
        preview_summary: "A public organisation is procuring IT.",
        requirements_preview: [
          { note: "keep me" },
          42,
          "keyDates: Closing window Within 14 days",
          "scope: Work for a public organisation.",
        ],
      },
    ];
    const deals: FakeDeal[] = [
      {
        id: "deal-mixed",
        submission_deadline: "2026-11-11T12:00:00.000Z",
        status: "OPEN",
      },
    ];
    const fake = fakeClient({ previews, deals });
    const result = await refreshDeadlineBands({
      client: fake.client,
      now: new Date("2026-11-09T12:00:00.000Z"),
      apply: true,
    });

    expect(result).toMatchObject({ stale: 1, updated: 1, textRewritten: 1 });
    expect(previews[0]?.requirements_preview).toEqual([
      { note: "keep me" },
      42,
      "keyDates: Closing window Within 3 days",
      "scope: Work for a public organisation.",
    ]);
    expect(fake.updates[0]?.requirements).toEqual([
      { note: "keep me" },
      42,
      "keyDates: Closing window Within 3 days",
      "scope: Work for a public organisation.",
    ]);
    expect(fake.updates[0]?.summary).toBeUndefined();
  });

  it("updates only stale keyDates requirements without writing a summary", async () => {
    const summary = "A public organisation is procuring IT.";
    const previews: FakePreview[] = [
      {
        deal_id: "deal-requirements",
        deadline_band: "Within 3 days",
        is_published: true,
        preview_summary: summary,
        requirements_preview: [
          "scope: Work for a public organisation.",
          "keyDates: Closing window Within 14 days",
        ],
      },
    ];
    const deals: FakeDeal[] = [
      {
        id: "deal-requirements",
        submission_deadline: "2026-11-11T12:00:00.000Z",
        status: "OPEN",
      },
    ];
    const fake = fakeClient({ previews, deals });
    const result = await refreshDeadlineBands({
      client: fake.client,
      now: new Date("2026-11-09T12:00:00.000Z"),
      apply: true,
    });

    expect(result).toMatchObject({ stale: 1, updated: 1, textRewritten: 1 });
    expect(fake.updates[0]?.requirements).toEqual([
      "scope: Work for a public organisation.",
      "keyDates: Closing window Within 3 days",
    ]);
    expect(fake.updates[0]?.summary).toBeUndefined();
    expect(previews[0]?.preview_summary).toBe(summary);
  });

  it("never writes a preview summary when the stored one is null", async () => {
    const previews: FakePreview[] = [
      {
        deal_id: "deal-null-summary",
        deadline_band: "Within 3 days",
        is_published: true,
        preview_summary: null,
        requirements_preview: ["keyDates: Closing window Within 14 days"],
      },
    ];
    const deals: FakeDeal[] = [
      {
        id: "deal-null-summary",
        submission_deadline: "2026-11-11T12:00:00.000Z",
        status: "OPEN",
      },
    ];
    const fake = fakeClient({ previews, deals });
    const result = await refreshDeadlineBands({
      client: fake.client,
      now: new Date("2026-11-09T12:00:00.000Z"),
      apply: true,
    });

    expect(result).toMatchObject({ stale: 1, updated: 1, textRewritten: 1 });
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]?.summary).toBeUndefined();
    expect(previews[0]?.preview_summary).toBeNull();
  });

  it("leaves null and past deadlines untouched", async () => {
    const previews: FakePreview[] = [
      {
        deal_id: "deal-null",
        deadline_band: "Upcoming / date not yet fixed",
        is_published: true,
      },
      {
        deal_id: "deal-past",
        deadline_band: "Within 3 days",
        is_published: true,
      },
    ];
    const deals: FakeDeal[] = [
      { id: "deal-null", submission_deadline: null, status: "OPEN" },
      {
        id: "deal-past",
        submission_deadline: "2026-11-01T12:00:00.000Z",
        status: "OPEN",
      },
    ];
    const fake = fakeClient({ previews, deals });
    const result = await refreshDeadlineBands({
      client: fake.client,
      now: new Date("2026-11-09T12:00:00.000Z"),
      apply: true,
    });
    expect(result).toMatchObject({ scanned: 2, stale: 0, updated: 0 });
    expect(fake.updates).toEqual([]);
    expect(previews.map((row) => row.deadline_band)).toEqual([
      "Upcoming / date not yet fixed",
      "Within 3 days",
    ]);
  });

  it("plans updates but writes nothing when apply is false", async () => {
    const previews: FakePreview[] = [
      {
        deal_id: "deal-1",
        deadline_band: "Within 30 days",
        is_published: true,
      },
    ];
    const deals: FakeDeal[] = [
      {
        id: "deal-1",
        submission_deadline: "2026-11-19T12:00:00.000Z",
        status: "OPEN",
      },
    ];
    const fake = fakeClient({ previews, deals });
    const result = await refreshDeadlineBands({
      client: fake.client,
      now: new Date("2026-11-09T12:00:00.000Z"),
      apply: false,
    });
    expect(result).toMatchObject({ scanned: 1, stale: 1, updated: 0 });
    expect(fake.updates).toEqual([]);
    expect(previews[0]?.deadline_band).toBe("Within 30 days");
  });

  it("plans stale text but writes nothing when apply is false", async () => {
    const previews: FakePreview[] = [
      {
        deal_id: "deal-text",
        deadline_band: "Within 3 days",
        is_published: true,
        preview_summary: "Closing window Within 14 days.",
        requirements_preview: ["keyDates: Closing window Within 14 days"],
      },
    ];
    const deals: FakeDeal[] = [
      {
        id: "deal-text",
        submission_deadline: "2026-11-11T12:00:00.000Z",
        status: "OPEN",
      },
    ];
    const fake = fakeClient({ previews, deals });
    const result = await refreshDeadlineBands({
      client: fake.client,
      now: new Date("2026-11-09T12:00:00.000Z"),
      apply: false,
    });

    expect(result).toMatchObject({
      scanned: 1,
      stale: 1,
      updated: 0,
      textRewritten: 0,
    });
    expect(fake.updates).toEqual([]);
    expect(previews[0]?.preview_summary).toBe(
      "Closing window Within 14 days.",
    );
    expect(previews[0]?.requirements_preview).toEqual([
      "keyDates: Closing window Within 14 days",
    ]);
  });

  it("only writes members of DEADLINE_BANDS and never a date", async () => {
    const previews: FakePreview[] = [
      {
        deal_id: "deal-1",
        deadline_band: "Within 30 days",
        is_published: true,
      },
      {
        deal_id: "deal-2",
        deadline_band: "Within 30 days",
        is_published: true,
      },
      {
        deal_id: "deal-3",
        deadline_band: "Within 30 days",
        is_published: true,
      },
    ];
    const deals: FakeDeal[] = [
      {
        id: "deal-1",
        submission_deadline: "2026-11-10T12:00:00.000Z",
        status: "OPEN",
      },
      {
        id: "deal-2",
        submission_deadline: "2026-11-13T12:00:00.000Z",
        status: "OPEN",
      },
      {
        id: "deal-3",
        submission_deadline: "2026-11-20T12:00:00.000Z",
        status: "OPEN",
      },
    ];
    const fake = fakeClient({ previews, deals });
    await refreshDeadlineBands({
      client: fake.client,
      now: new Date("2026-11-09T12:00:00.000Z"),
      apply: true,
    });
    expect(fake.updates.length).toBeGreaterThan(0);
    for (const update of fake.updates) {
      expect(DEADLINE_BANDS).toContain(update.band);
      expect(update.band).not.toMatch(
        /\d{4}-\d{2}-\d{2}|\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/,
      );
    }
  });

  it("loads only the deal columns needed for the band", async () => {
    const fake = fakeClient({
      previews: [
        {
          deal_id: "deal-1",
          deadline_band: "Within 30 days",
          is_published: true,
        },
      ],
      deals: [
        {
          id: "deal-1",
          submission_deadline: "2026-11-25T12:00:00.000Z",
          status: "OPEN",
        },
      ],
    });
    await refreshDeadlineBands({ client: fake.client, apply: false });
    expect(fake.selects).toContainEqual({
      table: "deals",
      columns: "id, submission_deadline, status",
    });
  });

  it("counts rows the publish gate unpublishes during the update", async () => {
    const previews: FakePreview[] = [
      {
        deal_id: "deal-gate",
        deadline_band: "Within 30 days",
        is_published: true,
      },
    ];
    const deals: FakeDeal[] = [
      {
        id: "deal-gate",
        submission_deadline: "2026-11-10T12:00:00.000Z",
        status: "OPEN",
      },
    ];
    const fake = fakeClient({
      previews,
      deals,
      gate: (dealId) => dealId === "deal-gate",
    });
    const result = await refreshDeadlineBands({
      client: fake.client,
      now: new Date("2026-11-09T12:00:00.000Z"),
      apply: true,
    });
    expect(result.updated).toBe(1);
    expect(result.unpublishedByGate).toBe(1);
    expect(previews[0]?.is_published).toBe(false);
  });

  it("throws a stable error when a query fails", async () => {
    const previews = fakeClient({
      previews: [],
      deals: [],
      errorOn: "previews",
    });
    await expect(
      refreshDeadlineBands({ client: previews.client, apply: false }),
    ).rejects.toThrow("deadline band refresh failed");

    const update = fakeClient({
      previews: [
        {
          deal_id: "deal-1",
          deadline_band: "Within 30 days",
          is_published: true,
        },
      ],
      deals: [
        {
          id: "deal-1",
          submission_deadline: "2026-11-10T12:00:00.000Z",
          status: "OPEN",
        },
      ],
      errorOn: "update",
    });
    await expect(
      refreshDeadlineBands({
        client: update.client,
        now: new Date("2026-11-09T12:00:00.000Z"),
        apply: true,
      }),
    ).rejects.toThrow("deadline band refresh failed");
  });

  it("pages by deal_id and still visits every row when the gate takes rows down", async () => {
    const now = new Date("2026-11-11T00:30:00.000Z");
    const previews = Array.from({ length: 450 }, (_, i) => ({
      deal_id: `d${String(i).padStart(4, "0")}`,
      deadline_band: "Within 30 days",
      is_published: true,
    }));
    const deals = previews.map((p) => ({
      id: p.deal_id,
      submission_deadline: "2026-11-15T12:00:00.000Z",
      status: "OPEN",
    }));
    const fake = fakeClient({
      previews,
      deals,
      gate: (id) => Number(id.slice(1)) % 3 === 0,
    });
    const result = await refreshDeadlineBands({ client: fake.client, now, apply: true });
    expect(result.scanned).toBe(450);
    expect(result.updated).toBe(450);
    expect(result.unpublishedByGate).toBe(150);
    expect(previews.every((p) => p.deadline_band === "Within 7 days")).toBe(true);
    expect(fake.pages.map((p) => p.after)).toEqual([null, "d0199", "d0399"]);
  });
});
