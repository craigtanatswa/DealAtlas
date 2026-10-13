import { describe, expect, it } from "vitest";

import { signupPathWithNext } from "@/lib/auth/redirect";
import { takeHomeTeaser } from "@/lib/search/home-teaser";

describe("homepage teaser selection", () => {
  it("keeps open and closing-soon order and caps each sector at four", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `open-${i}`, sector: "PUBLIC" })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `soon-${i}`, sector: "HEALTHCARE" })),
      { id: "up-1", sector: "PUBLIC" },
    ];
    const picked = takeHomeTeaser(rows, (row) => row.sector);
    expect(picked.filter((row) => row.sector === "PUBLIC")).toHaveLength(4);
    expect(picked.filter((row) => row.sector === "HEALTHCARE")).toHaveLength(4);
    expect(picked.map((row) => row.id)).toEqual([
      "open-0",
      "open-1",
      "open-2",
      "open-3",
      "soon-0",
      "soon-1",
      "soon-2",
      "soon-3",
    ]);
  });

  it("stops at 24 cards", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      sector: `S${i % 10}`,
    }));
    expect(takeHomeTeaser(rows, (row) => row.sector)).toHaveLength(24);
  });

  it("sends anonymous card clicks to a same-site signup next path", () => {
    expect(signupPathWithNext("/deals/example-slug")).toBe(
      "/signup?next=%2Fdeals%2Fexample-slug",
    );
    expect(signupPathWithNext("https://evil.example/deals/example-slug")).toBe(
      "/signup?next=%2Fapp",
    );
  });
});
