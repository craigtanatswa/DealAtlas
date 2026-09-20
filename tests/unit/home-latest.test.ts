import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  HOME_FALLBACK_STATUS,
  HOME_LATEST_LIMIT,
  HOME_PRIMARY_STATUSES,
  takeHomeLatestItems,
} from "@/lib/search/home-latest";

const ROOT = path.resolve(__dirname, "../..");

describe("homepage latest opportunity selection", () => {
  it("keeps open and upcoming statuses as the live set", () => {
    expect(HOME_PRIMARY_STATUSES).toEqual(["OPEN", "UPCOMING"]);
    expect(HOME_FALLBACK_STATUS).toBe("AWARDED");
    expect(HOME_LATEST_LIMIT).toBe(8);
  });

  it("keeps live items ahead of awarded fillers", () => {
    const items = takeHomeLatestItems(
      [{ id: "open-1" }, { id: "upcoming-1" }],
      [{ id: "awarded-1" }, { id: "awarded-2" }],
      (item) => item.id,
      4,
    );
    expect(items.map((item) => item.id)).toEqual([
      "open-1",
      "upcoming-1",
      "awarded-1",
      "awarded-2",
    ]);
  });

  it("does not add awarded listings when live items fill the list", () => {
    const items = takeHomeLatestItems(
      [{ id: "open-1" }, { id: "open-2" }],
      [{ id: "awarded-1" }],
      (item) => item.id,
      2,
    );
    expect(items.map((item) => item.id)).toEqual(["open-1", "open-2"]);
  });

  it("fills remaining slots with awarded listings when few live items exist", () => {
    const items = takeHomeLatestItems(
      [{ id: "upcoming-1" }],
      [{ id: "awarded-1" }, { id: "awarded-2" }, { id: "awarded-3" }],
      (item) => item.id,
      3,
    );
    expect(items.map((item) => item.id)).toEqual([
      "upcoming-1",
      "awarded-1",
      "awarded-2",
    ]);
  });

  it("uses awarded listings when no live items are published", () => {
    const items = takeHomeLatestItems(
      [],
      [{ id: "awarded-1" }, { id: "awarded-2" }],
      (item) => item.id,
      8,
    );
    expect(items.map((item) => item.id)).toEqual(["awarded-1", "awarded-2"]);
  });

  it("dedupes overlapping keys without exceeding the limit", () => {
    const items = takeHomeLatestItems(
      [{ id: "open-1" }, { id: "open-1" }],
      [{ id: "open-1" }, { id: "awarded-1" }, { id: "awarded-2" }],
      (item) => item.id,
      2,
    );
    expect(items.map((item) => item.id)).toEqual(["open-1", "awarded-1"]);
  });

  it("loads homepage latest listings from deal_previews with live statuses first", () => {
    const search = fs.readFileSync(
      path.join(ROOT, "lib/matching/search.ts"),
      "utf8",
    );
    expect(search).toContain("searchHomeLatestDealPreviews");
    expect(search).toContain("listPublishedDealPreviews");
    expect(search).toContain("HOME_PRIMARY_STATUSES");
    expect(search).toContain("HOME_FALLBACK_STATUS");
    expect(search).toContain("takeHomeLatestItems");
    expect(search).not.toContain('.from("deals")');
  });
});
