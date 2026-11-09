// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureAlertsEvent } = vi.hoisted(() => ({
  captureAlertsEvent: vi.fn(),
}));

vi.mock("@/lib/alerts/analytics", () => ({ captureAlertsEvent }));

import { GetAlertsCard } from "@/components/alerts/get-alerts-card";
import { ALERTS_PENDING_MESSAGE } from "@/lib/alerts/signup-client";

const fetchMock = vi.fn();

function renderCard() {
  return render(
    <GetAlertsCard dealSlug="council-it-support-a1b2c3" categorySlug="technology" />,
  );
}

function fillValid(email = "buyer@example.com") {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Email me DealAtlas alerts. I can unsubscribe at any time.",
    }),
  );
}

function submit(container: HTMLElement) {
  fireEvent.submit(container.querySelector("form")!);
}

beforeEach(() => {
  captureAlertsEvent.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no layout; treat the card as visible unless a test says otherwise.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(
    [{}] as unknown as DOMRectList,
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GetAlertsCard", () => {
  it("renders the idle card and captures the viewed event", () => {
    const { container } = renderCard();

    expect(
      screen.getByRole("heading", { name: "Get free alerts" }),
    ).toBeTruthy();
    expect(container.querySelector("aside")?.getAttribute("data-state")).toBe(
      "idle",
    );
    expect(captureAlertsEvent).toHaveBeenCalledWith("alerts_signup_viewed", {
      category_slug: "technology",
    });
  });

  it("shows both client validation errors without fetching", () => {
    const { container } = renderCard();

    submit(container);

    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(
      screen.getByText("Tick the box to agree to alert emails."),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector("aside")?.getAttribute("data-state")).toBe(
      "invalid",
    );
    expect(captureAlertsEvent).toHaveBeenCalledWith("alerts_signup_result", {
      category_slug: "technology",
      outcome: "invalid",
    });
    expect(captureAlertsEvent).not.toHaveBeenCalledWith(
      "alerts_signup_submitted",
      expect.anything(),
    );
  });

  it("replaces the form with the pending status", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    const { container } = renderCard();

    fillValid();
    submit(container);

    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(ALERTS_PENDING_MESSAGE);
    expect(container.textContent).not.toMatch(/already/i);
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("aside")?.getAttribute("data-state")).toBe(
      "pending",
    );
    expect(captureAlertsEvent).toHaveBeenCalledWith(
      "alerts_signup_submitted",
      { category_slug: "technology" },
    );
    expect(captureAlertsEvent).toHaveBeenCalledWith("alerts_signup_result", {
      category_slug: "technology",
      outcome: "pending",
    });
  });

  it("keeps the form and explains the retry delay when rate limited", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: { "retry-after": "120" },
      }),
    );
    const { container } = renderCard();

    fillValid();
    submit(container);

    expect(
      await screen.findByText("Too many attempts. Try again in 2 minutes."),
    ).toBeTruthy();
    expect(container.querySelector("form")).not.toBeNull();
    expect(container.querySelector("aside")?.getAttribute("data-state")).toBe(
      "rate_limited",
    );
    expect(captureAlertsEvent).toHaveBeenCalledWith("alerts_signup_result", {
      category_slug: "technology",
      outcome: "rate_limited",
    });
  });

  it("maps server INVALID_EMAIL to the inline email error", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "INVALID_EMAIL" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const { container } = renderCard();

    fillValid();
    submit(container);

    await waitFor(() => {
      expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    });
    expect(container.querySelector("aside")?.getAttribute("data-state")).toBe(
      "invalid",
    );
    expect(captureAlertsEvent).toHaveBeenCalledWith("alerts_signup_result", {
      category_slug: "technology",
      outcome: "invalid",
    });
  });

  it("never sends private signup values in analytics props", async () => {
    const email = "buyer@canary.example";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "INVALID_EMAIL" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const { container } = renderCard();

    fillValid(email);
    submit(container);

    await waitFor(() => {
      expect(captureAlertsEvent).toHaveBeenCalledWith("alerts_signup_result", {
        category_slug: "technology",
        outcome: "invalid",
      });
    });

    for (const call of captureAlertsEvent.mock.calls) {
      const props = call[1] as Record<string, unknown>;
      expect(
        Object.keys(props).every((key) =>
          ["category_slug", "outcome"].includes(key),
        ),
      ).toBe(true);
    }
    expect(JSON.stringify(captureAlertsEvent.mock.calls)).not.toContain(email);
  });

  it("does not count a hidden (other breakpoint) card as viewed", () => {
    vi.mocked(HTMLElement.prototype.getClientRects).mockReturnValue(
      [] as unknown as DOMRectList,
    );
    renderCard();
    expect(captureAlertsEvent).not.toHaveBeenCalled();
  });

  it("shows a generic error and sends only the public slug on failure", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    const { container } = renderCard();

    fillValid("someone@example.com");
    submit(container);

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeTruthy();
    expect(container.querySelector("aside")?.getAttribute("data-state")).toBe("error");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      email: "someone@example.com",
      dealSlug: "council-it-support-a1b2c3",
      consent: true,
      source: "deal_page",
      website: "",
    });
    expect(captureAlertsEvent).not.toHaveBeenCalledWith(
      "alerts_signup_result",
      expect.anything(),
    );
  });
});
