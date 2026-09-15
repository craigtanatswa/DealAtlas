// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AlertArticle } from "@/components/alerts/alert-article";
import type { AlertCentreDto } from "@/lib/alerts/types";
import { PLANS } from "@/lib/constants";

const FREE_CENTRE: AlertCentreDto = {
  plan: PLANS.FREE,
  unreadCount: 1,
  items: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      alertType: "NEW_MATCH",
      status: "UNREAD",
      createdAt: "2026-09-15T12:00:00.000Z",
      readAt: null,
      title: "New matching opportunity",
      message: "A new opportunity matches your profile or a saved search.",
      href: "/app/deals/22222222-2222-4222-8222-222222222222",
      dealId: "22222222-2222-4222-8222-222222222222",
      previewTitle: "Managed IT support for a public organisation",
    },
  ],
};

describe("alert centre UI", () => {
  it("keeps free alerts on the sanitised path", () => {
    render(<AlertArticle alert={FREE_CENTRE.items[0]!} plan={FREE_CENTRE.plan} />);
    expect(screen.getByRole("link", { name: "Review sanitised preview" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open source" })).toBeNull();
    expect(screen.queryByText(/CANARY/)).toBeNull();
  });

  it("makes Pro alerts actionable", () => {
    render(
      <AlertArticle
        alert={{
          ...FREE_CENTRE.items[0]!,
          title: "New match: CANARY SOURCE TITLE NEVER FREE",
          buyerName: "CANARY BUYER NEVER FREE",
          sourceUrl: "https://canary-source.example/notice",
          exactDeadline: "1 July 2026",
        }}
        plan={PLANS.PRO}
      />,
    );
    expect(screen.getByRole("link", { name: "Open opportunity" })).toBeTruthy();
    const source = screen.getByRole("link", { name: "Open source" });
    expect(source.getAttribute("href")).toBe("https://canary-source.example/notice");
    expect(screen.getByText("Buyer: CANARY BUYER NEVER FREE")).toBeTruthy();
  });
});
