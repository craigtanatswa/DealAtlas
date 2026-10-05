/**
 * Client-state probes (spec 5.9), the RSC navigation capture (RSC-03) and the
 * UI half of B-FLOW-02, in headless Chromium. Every request to a host other
 * than loopback is aborted, recorded and scanned (CLIENT-05).
 */
import path from "node:path";

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { LEAK_DIR, LEAK_PASSWORD } from "../lib/env";
import { reserve } from "../lib/http";
import type { Assertion, Ctx } from "../lib/probe";
import { ok, slugsIn } from "../lib/probe";
import { navigationRscCount } from "../lib/rsc-nav";
import type { Role } from "../lib/scan";
import { pubSlugs } from "./common";
import { previewTitles } from "./web";

type Capture = {
  nextF: string;
  windowProps: string;
  storage: string;
  analytics: string;
  innerText: string;
  aria: string;
};

type Tracker = {
  aborted: Array<{ url: string; method: string; postData: string | null }>;
  responses: Array<{ url: string; status: number; contentType: string; body: string }>;
  rsc: Array<{ url: string; status: number }>;
  rateLimited: string[];
};

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

// Runs before Next's inline flight scripts. `__next_f` is emptied once React
// hydrates, so a post-load read of the array misses the payload the spec
// scans (CLIENT-01). Record every push as it happens.
const NEXT_F_HOOK = `(() => {
  const w = window;
  const log = [];
  w.__leakNextF = log;
  const attach = (arr) => {
    if (!arr || arr.__leakHooked) return arr;
    try { Object.defineProperty(arr, "__leakHooked", { value: true }); } catch (e) { return arr; }
    const orig = arr.push;
    arr.push = function () {
      const result = orig.apply(this, arguments);
      try { log.push(JSON.stringify([].slice.call(arguments))); } catch (e) {}
      return result;
    };
    return arr;
  };
  let value = w.__next_f;
  if (Array.isArray(value)) attach(value);
  try {
    Object.defineProperty(w, "__next_f", {
      configurable: true,
      enumerable: true,
      get() { return value; },
      set(next) { value = Array.isArray(next) ? attach(next) : next; },
    });
  } catch (e) {}
})();`;

async function newContext(browser: Browser, ctx: Ctx, tracker: Tracker, storageState?: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: ctx.env.appUrl, storageState });
  await context.addInitScript({ content: NEXT_F_HOOK });
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (!isLoopback(request.url())) {
      tracker.aborted.push({ url: request.url(), method: request.method(), postData: request.postData() });
      await route.abort("blockedbyclient");
      return;
    }
    await reserve(request.method(), request.url());
    await route.continue();
  });
  context.on("response", (response) => {
    const url = response.url();
    if (!isLoopback(url)) return;
    const contentType = response.headers()["content-type"] ?? "";
    if (response.status() === 429) tracker.rateLimited.push(url);
    if (url.includes("_rsc=") || contentType.includes("text/x-component")) tracker.rsc.push({ url, status: response.status() });
    if (response.status() >= 300 && response.status() < 400) return;
    response
      .text()
      .then((body) => tracker.responses.push({ url, status: response.status(), contentType, body }))
      .catch(() => undefined);
  });
  return context;
}

async function login(context: BrowserContext, email: string, statePath: string): Promise<void> {
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(LEAK_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/(app|admin)(\/|$)/);
  await context.storageState({ path: statePath });
  await page.close();
}

// A native function, not a tsx-compiled callback: Playwright stringifies the
// function into the page, where the compiler's `__name` helper does not exist.
const captureInPage = new Function(
  "blank",
  `const seen = new WeakSet();
  const replacer = (_key, value) => {
    if (typeof value === "function") return "[fn]";
    if (typeof Node !== "undefined" && value instanceof Node) return "[node]";
    if (value && typeof value === "object") {
      if (seen.has(value)) return "[cycle]";
      seen.add(value);
    }
    return value;
  };
  const props = {};
  for (const key of Object.getOwnPropertyNames(window)) {
    if (blank.includes(key)) continue;
    try {
      props[key] = JSON.parse(JSON.stringify(window[key], replacer) ?? "null");
    } catch {
      props[key] = "[unserialisable]";
    }
  }
  const dump = (s) => Object.fromEntries(Array.from({ length: s.length }, (_v, i) => s.key(i)).map((k) => [k, s.getItem(k)]));
  return {
    nextF: JSON.stringify(window.__next_f ?? null) + "\\n" + JSON.stringify(window.__leakNextF ?? []),
    windowProps: JSON.stringify(props).slice(0, 4000000),
    storage: JSON.stringify({ localStorage: dump(localStorage), sessionStorage: dump(sessionStorage), cookie: document.cookie }),
    analytics: JSON.stringify({ dataLayer: window.dataLayer ?? null, title: document.title, href: location.href }),
    innerText: document.body?.innerText ?? "",
  };`,
) as (blank: string[]) => Capture;

async function capture(page: Page, blankProps: string[]): Promise<Capture> {
  const data = await page.evaluate(captureInPage, blankProps);
  let aria = "";
  try {
    aria = await page.locator("body").ariaSnapshot();
  } catch (error) {
    aria = `[aria snapshot failed: ${String(error)}]`;
  }
  return { ...data, aria };
}

const CLIENT_PARTS: Array<[string, (c: Capture, t: Tracker) => string]> = [
  ["CLIENT-01", (c) => c.nextF],
  ["CLIENT-02", (c) => c.windowProps],
  ["CLIENT-03", (c) => c.storage],
  ["CLIENT-05", (c, t) => `${c.analytics}\n${JSON.stringify(t.aborted)}`],
  ["CLIENT-06", (c) => `${c.innerText}\n${c.aria}`],
];

async function visit(page: Page, target: string): Promise<{ status: number | null; error?: string }> {
  try {
    const response = await page.goto(target, { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    return { status: response?.status() ?? null };
  } catch (error) {
    return { status: null, error: String(error) };
  }
}

function freshTracker(): Tracker {
  return { aborted: [], responses: [], rsc: [], rateLimited: [] };
}

function responsesText(t: Tracker): string {
  return t.responses.map((r) => `${r.url} ${r.status} ${r.contentType}\n${r.body}`).join("\n\n");
}

export async function clientProbes(ctx: Ctx, roles: Role[] = ["anon", "free"]): Promise<void> {
  const browser = await chromium.launch();
  try {
    const blankPage = await browser.newPage();
    await blankPage.goto("about:blank");
    const blankProps = await blankPage.evaluate(() => Object.getOwnPropertyNames(window));
    await blankPage.close();
    for (const role of roles) await clientRole(ctx, browser, role, blankProps);
    if (ctx.phase === "B") await uiSaveFlow(ctx, browser);
  } finally {
    await browser.close();
  }
}

const loggedIn = new Set<string>();

async function contextFor(ctx: Ctx, browser: Browser, role: Role, tracker: Tracker): Promise<BrowserContext> {
  const statePath = path.join(LEAK_DIR, `state-${role}-${ctx.phase}.json`);
  if (role === "anon") return newContext(browser, ctx, tracker);
  if (!loggedIn.has(statePath)) {
    const setup = await newContext(browser, ctx, freshTracker());
    await login(setup, ctx.users[role as Exclude<Role, "anon">].email, statePath);
    await setup.close();
    loggedIn.add(statePath);
  }
  return newContext(browser, ctx, tracker, statePath);
}

async function clientRole(ctx: Ctx, browser: Browser, role: Role, blankProps: string[]): Promise<void> {
  const pages = ["/", "/deals", `/deals/${ctx.row("B1").slug}`, `/deals/${ctx.row("A1").slug}`, "/app/alerts", "/app/saved"];
  for (const target of pages) {
    const tracker = freshTracker();
    const context = await contextFor(ctx, browser, role, tracker);
    const page = await context.newPage();
    const visited = await visit(page, target);
    const snap = await capture(page, blankProps);
    await context.close();

    const { req: controlReq, spans } = ctx.controlRequest({ path: target });
    const reflected = spans.some((s) => s.tokenIds.some(ctx.forbidden(role)));
    let control: { snap: Capture; tracker: Tracker } | null = null;
    if (reflected) {
      const controlTracker = freshTracker();
      const controlContext = await contextFor(ctx, browser, role, controlTracker);
      const controlPage = await controlContext.newPage();
      await visit(controlPage, controlReq.path);
      control = { snap: await capture(controlPage, blankProps), tracker: controlTracker };
      await controlContext.close();
    }
    const harness: Assertion[] = [
      ok("page_loaded", visited.status !== null, visited.error),
      ok("no_429", tracker.rateLimited.length === 0, tracker.rateLimited, { code: "RATE_LIMITED" }),
    ];
    for (const [id, pick] of CLIENT_PARTS) {
      const selfTest =
        id === "CLIENT-01" && role === "anon" && target.endsWith(ctx.row("B1").slug)
          ? (scan: { tokens: Map<string, unknown> }) => [ok("selftest_T32_present", scan.tokens.has("T32"))]
          : () => [];
      ctx.capture({
        id,
        instance: target,
        role,
        text: pick(snap, tracker),
        reflect: reflected ? { spans, controlText: control ? pick(control.snap, control.tracker) : null } : undefined,
        check: (scan) => [...harness, ...selfTest(scan)],
      });
    }
    ctx.capture({
      id: "CLIENT-04",
      instance: target,
      role,
      text: responsesText(tracker),
      reflect: reflected ? { spans, controlText: control ? responsesText(control.tracker) : null } : undefined,
      check: () => [ok("captured_responses", tracker.responses.length > 0, tracker.responses.length), ...harness],
    });
  }
  await navigationScript(ctx, browser, role);
}

/** RSC-03: /deals -> PUB card -> /deals -> search submit -> category link, capturing client-side RSC fetches. */
async function navigationScript(ctx: Ctx, browser: Browser, role: Role): Promise<void> {
  const pub = pubSlugs(ctx);
  const tracker = freshTracker();
  const context = await contextFor(ctx, browser, role, tracker);
  const page = await context.newPage();
  const steps: Array<{ name: string; run: () => Promise<string | void> }> = [
    {
      name: "card",
      run: async () => {
        const hrefs = await page.locator('a[href^="/deals/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
        const target = hrefs.find((h) => [...slugsIn(h)].some((s) => pub.has(s)));
        if (!target) throw new Error("no PUB card on /deals");
        await page.locator(`a[href="${target}"]`).first().click();
        await page.waitForURL((u) => u.pathname === target);
        return target;
      },
    },
    {
      name: "deals",
      run: async () => {
        await page.locator('a[href="/deals"]').first().click();
        await page.waitForURL((u) => u.pathname === "/deals");
      },
    },
    {
      name: "search",
      run: async () => {
        const input = page.locator('input[name="q"]').first();
        await input.fill("grounds");
        await input.press("Enter");
        await page.waitForURL((u) => u.searchParams.get("q") === "grounds");
      },
    },
    {
      name: "category",
      run: async () => {
        if ((await page.locator('a[href^="/categories/"]').count()) === 0) {
          await page.locator('a[href="/categories"]').first().click();
          await page.waitForURL((u) => u.pathname === "/categories");
        }
        await page.locator('a[href^="/categories/"]').first().click();
        await page.waitForURL((u) => u.pathname.startsWith("/categories/"));
      },
    },
  ];
  const opened = await visit(page, "/deals");
  const perStep: Array<{ step: string; rsc: number; error?: string }> = [];
  for (const step of steps) {
    const before = tracker.rsc.length;
    let error: string | undefined;
    let cardPath = "";
    try {
      const tied = await step.run();
      if (typeof tied === "string") cardPath = tied;
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    } catch (e) {
      error = String(e);
    }
    // The deals index prefetches visible cards, so the click often reuses that
    // flight and records no new response. Count that prefetch, a flight fetched
    // during the click, or an HTML document that inlines the payload.
    const rsc = step.name === "card"
      ? navigationRscCount(tracker, cardPath)
      : tracker.rsc.length - before;
    perStep.push({ step: step.name, rsc, error });
  }
  await context.close();
  ctx.derive({
    id: "RSC-03",
    instance: "navigation",
    role,
    assertions: [
      ok("deals_loaded", opened.status === 200, opened),
      ...perStep.map((s) => ok(`rsc_captured:${s.step}`, !s.error && s.rsc >= 1, s)),
      ok("no_429", tracker.rateLimited.length === 0, tracker.rateLimited, { code: "RATE_LIMITED" }),
    ],
    detail: { steps: perStep, captured: tracker.rsc },
  });
  ctx.capture({
    id: "CLIENT-04",
    instance: "navigation-script",
    role,
    text: responsesText(tracker),
    check: () => [ok("captured_responses", tracker.responses.length > 0, tracker.responses.length)],
  });
  ctx.capture({ id: "CLIENT-05", instance: "navigation-script", role, text: JSON.stringify(tracker.aborted) });
  const replays = [...new Set(tracker.rsc.map((r) => r.url))];
  await Promise.all(
    replays.map((url) => {
      const parsed = new URL(url);
      return ctx.run({
        id: "RSC-03",
        instance: `${parsed.pathname}${parsed.search}`,
        role,
        req: { path: parsed.pathname, query: [...parsed.searchParams.entries()], rsc: "rsc" },
        requireRsc: true,
      });
    }),
  );
}

/** B-FLOW-02 (UI): save B2 from its public page, then /app/saved lists it. */
async function uiSaveFlow(ctx: Ctx, browser: Browser): Promise<void> {
  const tracker = freshTracker();
  const context = await contextFor(ctx, browser, "free", tracker);
  const page = await context.newPage();
  const b2 = ctx.row("B2");
  const assertions: Assertion[] = [];
  try {
    await visit(page, `/deals/${b2.slug}`);
    await page.getByRole("button", { name: "Save opportunity" }).click();
    await page.getByRole("button", { name: "Unsave" }).waitFor({ timeout: 15_000 });
    assertions.push(ok("saved_in_ui", true));
  } catch (error) {
    assertions.push(ok("saved_in_ui", false, String(error)));
  }
  await context.close();
  const saved = ctx.psql(`select count(*) from public.saved_deals where user_id = '${ctx.session("free").userId}' and deal_id = '${b2.deal_id}'`);
  assertions.push(ok("saved_row_exists", saved === "1", saved));
  ctx.derive({ id: "FLOW-02", instance: "ui-save-B2", role: "free", assertions });
  const title = previewTitles(ctx).get("B2")?.toLowerCase();
  await ctx.run({
    id: "FLOW-02",
    instance: "app-saved-after-ui",
    role: "free",
    req: { path: "/app/saved" },
    status: [200],
    check: (o) => [ok("lists_B2", o.scan.layers.L5.includes(b2.deal_id) || Boolean(title && o.scan.layers.L5.includes(title)))],
  });
}
