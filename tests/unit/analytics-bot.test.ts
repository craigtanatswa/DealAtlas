import { describe, expect, it } from "vitest";

import { isAutomatedUserAgent, isAutomationTraffic } from "@/lib/analytics/bot";

const NORMAL_BROWSER_USER_AGENTS = [
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
];

const AUTOMATION_USER_AGENTS = [
  "",
  "   ",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
  "Mozilla/5.0 (compatible; DuckDuckBot/1.0; +http://duckduckgo.com/duckduckbot.html)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Twitterbot/1.0",
  "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
  "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
  "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
  "Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)",
  "Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot)",
  "Pingdom.com_bot_version_1.4",
  "UptimeRobot/2.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Unknown; Linux x86_64) AppleWebKit/538.1 (KHTML, like Gecko) PhantomJS/2.1.1 Safari/538.1",
  "Mozilla/5.0 (compatible; Selenium/4.0)",
  "Mozilla/5.0 (compatible; Puppeteer/23.0)",
  "Mozilla/5.0 (compatible; Playwright/1.63)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 (compatible; GPTBot/1.0; +https://openai.com/gptbot)",
  "Mozilla/5.0 (compatible; ClaudeBot/1.0)",
  "SomeCrawler/1.0",
  "SomeSpider/1.0",
  "A random crawl agent",
];

describe("isAutomationTraffic", () => {
  it("treats a missing or empty user agent as automation", () => {
    expect(isAutomationTraffic({})).toBe(true);
    expect(isAutomationTraffic({ userAgent: undefined })).toBe(true);
    expect(isAutomationTraffic({ userAgent: null })).toBe(true);
    expect(isAutomationTraffic({ userAgent: "" })).toBe(true);
    expect(isAutomationTraffic({ userAgent: "   " })).toBe(true);
  });

  it("treats navigator.webdriver as automation even with a normal UA", () => {
    expect(isAutomationTraffic({ userAgent: NORMAL_BROWSER_USER_AGENTS[0], webdriver: true })).toBe(
      true,
    );
  });

  it.each(AUTOMATION_USER_AGENTS)("flags bot user agent %j", (userAgent) => {
    expect(isAutomationTraffic({ userAgent, webdriver: false })).toBe(true);
  });

  it.each(NORMAL_BROWSER_USER_AGENTS)("allows real browser user agent %s", (userAgent) => {
    expect(isAutomationTraffic({ userAgent, webdriver: false })).toBe(false);
    expect(isAutomationTraffic({ userAgent, webdriver: undefined })).toBe(false);
    expect(isAutomationTraffic({ userAgent, webdriver: null })).toBe(false);
  });
});

describe("isAutomatedUserAgent", () => {
  it("allows an omitted UA because app-triggered server events have none", () => {
    expect(isAutomatedUserAgent(undefined)).toBe(false);
  });

  it("drops an explicitly empty or bot UA", () => {
    expect(isAutomatedUserAgent(null)).toBe(true);
    expect(isAutomatedUserAgent("")).toBe(true);
    expect(isAutomatedUserAgent("Googlebot/2.1")).toBe(true);
  });

  it("allows an explicit normal browser UA", () => {
    expect(isAutomatedUserAgent(NORMAL_BROWSER_USER_AGENTS[0])).toBe(false);
  });
});