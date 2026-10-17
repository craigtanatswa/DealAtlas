import { IngestionError } from "@/ingestion/core/errors";
import type { TextHttpClient } from "@/ingestion/core/http";
import { withRetry } from "@/ingestion/core/retry";

/** Longest-match Allow/Disallow for User-agent: *. Empty Disallow allows the path. */
export function robotsAllows(robots: string, path: string): boolean {
  const rules: Array<{ allow: boolean; path: string }> = [];
  let inStar = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const agent = /^user-agent\s*:\s*(.+)$/i.exec(line);
    if (agent) {
      inStar = agent[1].trim() === "*";
      continue;
    }
    if (!inStar) continue;
    const disallow = /^disallow\s*:\s*(.*)$/i.exec(line);
    if (disallow) {
      rules.push({ allow: false, path: disallow[1].trim() });
      continue;
    }
    const allow = /^allow\s*:\s*(.*)$/i.exec(line);
    if (allow) {
      rules.push({ allow: true, path: allow[1].trim() });
    }
  }

  let best: { length: number; allow: boolean } | null = null;
  for (const rule of rules) {
    if (!rule.path) continue;
    if (path === rule.path || path.startsWith(rule.path)) {
      if (!best || rule.path.length > best.length) {
        best = { length: rule.path.length, allow: rule.allow };
      }
    }
  }
  return best ? best.allow : true;
}

/** A 404, an HTML error page, or a body with no robot rules is not a disallow list. */
export function publishedRobotsBody(body: string, status: number): string | null {
  if (status === 404 || status === 410) return null;
  const head = body.slice(0, 4000);
  if (/<!doctype html|<html[\s>]/i.test(head)) return null;
  if (!/user-agent\s*:/i.test(head) && !/disallow\s*:/i.test(head)) return null;
  return body;
}

export async function assertRobotsAllow(options: {
  http: TextHttpClient;
  robotsUrl: string;
  path: string;
  sourceLabel: string;
}): Promise<void> {
  let body = "";
  let status = 200;
  try {
    const response = await withRetry(() => options.http.getText(options.robotsUrl));
    body = response.body;
    status = response.status;
  } catch (error) {
    if (!isMissingRobots(error)) throw error;
    return;
  }
  const rules = publishedRobotsBody(body, status);
  if (!rules) return;
  if (!robotsAllows(rules, options.path)) {
    throw new IngestionError({
      message: `${options.sourceLabel} robots.txt disallows ${options.path}.`,
      stage: "discover",
      code: "ROBOTS_DISALLOW",
      retryable: false,
    });
  }
}

function isMissingRobots(error: unknown): boolean {
  if (!(error instanceof IngestionError)) return false;
  return (
    error.code === "HTTP_REDIRECT" ||
    error.code === "URL_PATH_DENIED" ||
    error.code === "HTTP_404"
  );
}
