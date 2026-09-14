// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { DealSearchResults } from "@/components/deals/deal-search-results";
import { DEAL_PREVIEW_DETAIL_FIXTURE } from "@/components/deals/fixtures";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import { GET as getProtectedDeal } from "@/app/api/deals/[id]/route";
import {
  findForbiddenPublicKeys,
  findProtectedMarkerLeaks,
} from "../helpers/protected-leak";

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

  it("rejects direct protected deal API access without querying canonical data", async () => {
    const response = await getProtectedDeal();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(401);
    expect(findProtectedMarkerLeaks(serialized)).toEqual([]);
    expect(findForbiddenPublicKeys(body)).toEqual([]);
    expect(body.error).toMatch(/Pro subscription/i);
  });
});
