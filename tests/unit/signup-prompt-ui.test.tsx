// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignupPrompt } from "@/components/conversion/signup-prompt";
import {
  SIGNUP_PROMPT_DELAY_MS,
  SIGNUP_PROMPT_STORAGE_KEY,
} from "@/lib/conversion/signup-prompt";

vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
  }: {
    alt: string;
    src: string;
  }) => <img alt={alt} src={src} />,
}));

describe("signup prompt dialog", () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("does not open before a minute of browsing", () => {
    render(<SignupPrompt enabled />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens after one minute of visible time", async () => {
    vi.useFakeTimers();
    render(<SignupPrompt enabled />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIGNUP_PROMPT_DELAY_MS);
    });

    expect(
      screen.getByRole("heading", {
        name: "Create a free account to keep going",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create account" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continue browsing" }),
    ).toBeTruthy();
  });

  it("stays closed after the visitor dismisses it", async () => {
    sessionStorage.setItem(
      SIGNUP_PROMPT_STORAGE_KEY,
      JSON.stringify({ elapsedMs: SIGNUP_PROMPT_DELAY_MS, dismissed: false }),
    );
    render(<SignupPrompt enabled />);

    expect(
      await screen.findByRole("heading", {
        name: "Create a free account to keep going",
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue browsing" }));

    await waitFor(() => {
      expect(
        JSON.parse(sessionStorage.getItem(SIGNUP_PROMPT_STORAGE_KEY) ?? "{}"),
      ).toMatchObject({ dismissed: true });
    });

    cleanup();
    render(<SignupPrompt enabled />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not open for signed-in visitors", () => {
    sessionStorage.setItem(
      SIGNUP_PROMPT_STORAGE_KEY,
      JSON.stringify({ elapsedMs: SIGNUP_PROMPT_DELAY_MS, dismissed: false }),
    );
    const { container } = render(<SignupPrompt enabled={false} />);
    expect(container.firstChild).toBeNull();
  });
});
