/**
 * Bot / automation traffic filter (Craig-approved 9 Nov).
 *
 * Missing or empty user agents, `navigator.webdriver` and the user-agent
 * patterns below are treated as automation. Keep the list lowercase and
 * substring-based so it stays easy to extend without touching logic.
 */
const AUTOMATION_USER_AGENT_MARKERS = [
  // Search and social crawlers
  "googlebot",
  "bingbot",
  "baiduspider",
  "yandex",
  "duckduckbot",
  "slurp",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "applebot",
  "petalsearch",
  "bytespider",
  "amazonbot",
  // SEO / monitoring crawlers
  "semrush",
  "ahrefs",
  "mj12bot",
  "dotbot",
  "pingdom",
  "uptimerobot",
  // Headless browsers and automation frameworks
  "headlesschrome",
  "headless",
  "phantomjs",
  "selenium",
  "puppeteer",
  "playwright",
  "cyberfun",
  // LLM crawlers
  "gptbot",
  "claudebot",
  // Generic signals
  "bot/",
  "crawler",
  "spider",
  "crawl",
] as const;

const AUTOMATION_USER_AGENT_PATTERN = new RegExp(
  AUTOMATION_USER_AGENT_MARKERS.map((marker) =>
    marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|"),
  "i",
);

export type AutomationSignals = {
  userAgent?: string | null;
  webdriver?: boolean | null;
};

/**
 * True when traffic should not be counted as a human. Missing/empty UA and
 * `navigator.webdriver` are automation; otherwise the UA must match the
 * maintained marker list.
 */
export function isAutomationTraffic({ userAgent, webdriver }: AutomationSignals): boolean {
  if (webdriver === true) {
    return true;
  }
  if (typeof userAgent !== "string" || userAgent.trim() === "") {
    return true;
  }
  return AUTOMATION_USER_AGENT_PATTERN.test(userAgent);
}

/**
 * For server-side app events (sign-up, subscription) there is often no
 * browser user agent. Only filter when a UA is explicitly supplied and is
 * empty or automated; `undefined` means "app-triggered, allow".
 */
export function isAutomatedUserAgent(userAgent: string | null | undefined): boolean {
  return userAgent !== undefined && isAutomationTraffic({ userAgent });
}