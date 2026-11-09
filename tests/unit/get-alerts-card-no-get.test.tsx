// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/alerts/analytics", () => ({ captureAlertsEvent: vi.fn() }));

import { GetAlertsCard } from "@/components/alerts/get-alerts-card";

const card = (
  <GetAlertsCard dealSlug="council-it-support-a1b2c3" categorySlug="technology" />
);

function serverForm(): { html: string; form: HTMLFormElement } {
  const html = renderToString(card);
  const host = document.createElement("div");
  host.innerHTML = html;
  const form = host.querySelector("form");
  expect(form).not.toBeNull();
  return { html, form: form! };
}

afterEach(() => cleanup());

describe("GetAlertsCard never submits the email in a URL", () => {
  it("server-renders the form as method=post", () => {
    const { html, form } = serverForm();
    expect(form.getAttribute("method")).toBe("post");
    expect(html).toMatch(/<form[^>]*\smethod="post"/);
    expect(html).not.toMatch(/method="get"/i);
  });

  it("server-renders the submit button disabled, so nothing submits before hydration", () => {
    const { form } = serverForm();
    const submits = form.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      'button:not([type="button"]):not([type="reset"]), input[type="submit"], input[type="image"]',
    );
    expect(submits.length).toBeGreaterThan(0);
    for (const button of submits) {
      expect(button.disabled).toBe(true);
    }
  });

  it("puts no named field into an action, formaction or query string", () => {
    const { html, form } = serverForm();
    const action = form.getAttribute("action");
    expect(action === null || !action.includes("?")).toBe(true);
    expect(html).not.toMatch(/formaction=/i);
    expect(html).not.toMatch(/formmethod=/i);
    const names = [...form.querySelectorAll("[name]")].map((el) =>
      el.getAttribute("name"),
    );
    expect(names).toContain("email");
    for (const name of names) {
      expect(html).not.toContain(`?${name}=`);
      expect(html).not.toContain(`&amp;${name}=`);
      expect(html).not.toContain(`&${name}=`);
    }
  });

  it("tells no-JavaScript visitors to enable it", () => {
    const html = renderToString(card);
    expect(html).toContain("<noscript>");
    expect(html).toContain("Enable JavaScript to sign up");
  });

  it("enables the submit button once hydrated", () => {
    render(card);
    const button = screen.getByRole("button", { name: "Get alerts" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
