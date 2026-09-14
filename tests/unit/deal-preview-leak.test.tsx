// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { DealSearchResults } from "@/components/deals/deal-search-results";
import { DEAL_PREVIEW_DETAIL_FIXTURE } from "@/components/deals/fixtures";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import { findProtectedMarkerLeaks } from "../helpers/protected-leak";

describe("free discovery HTML and protected paths", () => {
  it("renders free card/detail HTML without seeded protected markers", () => {
    const detail = render(<DealPreviewDetail deal={DEAL_PREVIEW_DETAIL_FIXTURE} />);
    const search = render(
      <DealSearchResults
        filters={{ page: 1, limit: 20 }}
        result={{
          items: [DEAL_PREVIEW_DETAIL_FIXTURE],
          total: 1,
          page: 1,
          pageSize: 20,
        }}
      />,
    );

    const html = `${detail.container.innerHTML}\n${search.container.innerHTML}`;
    expect(findProtectedMarkerLeaks(html)).toEqual([]);
    expect(html).not.toMatch(/blur/);
    expect(html).toContain(DEAL_PREVIEW_DETAIL_FIXTURE.previewTitle);
    expect(html).toContain("Unlock the buyer and pursue this opportunity");
    expect(html).toContain("1 opportunity");
  });

  it("does not accept protected values on the locked panel", () => {
    const html = render(<UnlockPanel />).container.innerHTML;
    expect(findProtectedMarkerLeaks(html)).toEqual([]);
    expect(html).not.toMatch(/CANARY/);
  });

  it("does not ship a UI bypass or protected fields on free fixtures", () => {
    expect(DEAL_PREVIEW_DETAIL_FIXTURE).not.toHaveProperty("sourceTitle");
    expect(DEAL_PREVIEW_DETAIL_FIXTURE).not.toHaveProperty("sourceUrl");
    expect(DEAL_PREVIEW_DETAIL_FIXTURE).not.toHaveProperty("buyerName");
  });
});
