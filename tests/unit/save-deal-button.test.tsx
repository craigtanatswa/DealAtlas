// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  saveDealAction: vi.fn(),
  unsaveDealAction: vi.fn(),
}));

vi.mock("@/lib/saves/actions", () => actions);

import { SaveDealButton } from "@/components/saves/save-deal-button";

const baseProps = {
  dealId: "6f1c2f9e-3b4a-4c5d-8e7f-9a0b1c2d3e4f",
  used: 0,
  limit: null,
  signedIn: true,
};

beforeEach(() => {
  actions.saveDealAction.mockReset();
  actions.unsaveDealAction.mockReset();
});

afterEach(cleanup);

describe("SaveDealButton onChanged", () => {
  it("does not call onChanged for the initial state", () => {
    const onChanged = vi.fn();
    render(
      <SaveDealButton {...baseProps} saved={false} onChanged={onChanged} />,
    );

    expect(onChanged).not.toHaveBeenCalled();
  });

  it("calls onChanged once after a save action succeeds", async () => {
    actions.saveDealAction.mockResolvedValue({
      error: null,
      success: "Opportunity saved.",
    });
    const onChanged = vi.fn();
    render(
      <SaveDealButton {...baseProps} saved={false} onChanged={onChanged} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save opportunity" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(actions.saveDealAction).toHaveBeenCalledTimes(1);
  });

  it("calls onChanged after an unsave action succeeds", async () => {
    actions.unsaveDealAction.mockResolvedValue({
      error: null,
      success: "Removed from saved opportunities.",
    });
    const onChanged = vi.fn();
    render(
      <SaveDealButton {...baseProps} saved onChanged={onChanged} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unsave" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(actions.unsaveDealAction).toHaveBeenCalledTimes(1);
  });

  it("does not call onChanged when the action fails", async () => {
    actions.saveDealAction.mockResolvedValue({
      error: "That opportunity could not be saved.",
      success: null,
    });
    const onChanged = vi.fn();
    render(
      <SaveDealButton {...baseProps} saved={false} onChanged={onChanged} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save opportunity" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "That opportunity could not be saved.",
      ),
    );
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("DealViewerIsland wiring", () => {
  it("passes the viewer refresh callback to the signed-in save button", () => {
    const source = readFileSync(
      path.join(process.cwd(), "components/deals/deal-viewer-island.tsx"),
      "utf8",
    );

    expect(source).toContain("onChanged={refreshViewer}");
  });
});
