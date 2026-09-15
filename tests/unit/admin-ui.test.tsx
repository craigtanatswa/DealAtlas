// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminPageHeader, LeakageBadge } from "@/components/admin/admin-ui";

describe("admin UI", () => {
  it("labels an admin unpublished hold distinctly from a leak scan", () => {
    render(<LeakageBadge risk="LOW" published={false} held />);
    expect(screen.getByText("Held unpublished")).toBeTruthy();
  });

  it("renders operations copy without pretending there is a live opportunity count", () => {
    render(
      <AdminPageHeader
        title="Operations overview"
        description="Diagnose source-to-preview health without inventing live opportunity counts."
      />,
    );
    expect(screen.getByRole("heading", { name: "Operations overview" })).toBeTruthy();
    expect(screen.getByText(/source-to-preview health/)).toBeTruthy();
  });
});
