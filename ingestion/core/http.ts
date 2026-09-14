import { IngestionError } from "@/ingestion/core/errors";
import { retryAfterToMs } from "@/ingestion/core/retry";

export type AllowedFetchPolicy = {
  protocol: "https:";
  hosts: readonly string[];
  pathPrefixes: readonly string[];
};

export type TextGetResult = {
  url: string;
  status: number;
  contentType: string | null;
  body: string;
};

export type JsonGetResult = {
  url: string;
  status: number;
  contentType: string | null;
  body: unknown;
  rawText: string;
};

export type TextHttpClient = {
  getText: (url: string) => Promise<TextGetResult>;
};

export type JsonHttpClient = {
  getJson: (url: string) => Promise<JsonGetResult>;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;
const DEFAULT_USER_AGENT = "DealAtlasIngest/1.0 (official open-data client)";

export function assertAllowedUrl(
  value: string,
  policy: AllowedFetchPolicy,
): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new IngestionError({
      message: `Refusing to fetch invalid URL: ${value}`,
      stage: "fetch",
      code: "URL_INVALID",
      retryable: false,
    });
  }

  if (parsed.protocol !== policy.protocol) {
    throw new IngestionError({
      message: `Refusing to fetch ${parsed.protocol} URL; only ${policy.protocol} is allowed.`,
      stage: "fetch",
      code: "URL_PROTOCOL_DENIED",
      retryable: false,
    });
  }

  if (parsed.username || parsed.password) {
    throw new IngestionError({
      message: "Refusing to fetch a URL that embeds credentials.",
      stage: "fetch",
      code: "URL_CREDENTIALS_DENIED",
      retryable: false,
    });
  }

  if (!policy.hosts.includes(parsed.hostname)) {
    throw new IngestionError({
      message: `Refusing to fetch host ${parsed.hostname}; it is not in the source allowlist.`,
      stage: "fetch",
      code: "URL_HOST_DENIED",
      retryable: false,
    });
  }

  const pathAllowed = policy.pathPrefixes.some((prefix) =>
    parsed.pathname.startsWith(prefix),
  );
  if (!pathAllowed) {
    throw new IngestionError({
      message: `Refusing to fetch path ${parsed.pathname}; it is not an official data endpoint.`,
      stage: "fetch",
      code: "URL_PATH_DENIED",
      retryable: false,
    });
  }

  return parsed;
}

export function createAllowlistedTextClient(
  policy: AllowedFetchPolicy,
  options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    accept?: string;
  },
): TextHttpClient {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const accept = options?.accept ?? "text/plain, text/csv, text/html, application/json";

  return {
    async getText(url: string) {
      return getTextFollowingRedirects(url, policy, fetchImpl, timeoutMs, accept, 0);
    },
  };
}

export function createAllowlistedJsonClient(
  policy: AllowedFetchPolicy,
  options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    accept?: string;
  },
): JsonHttpClient {
  const textClient = createAllowlistedTextClient(policy, {
    fetchImpl: options?.fetchImpl,
    timeoutMs: options?.timeoutMs,
    accept: options?.accept ?? "application/json",
  });

  return {
    async getJson(url: string) {
      const response = await textClient.getText(url);
      let body: unknown = null;
      if (response.body.trim()) {
        try {
          body = JSON.parse(response.body) as unknown;
        } catch {
          throw new IngestionError({
            message: `Non-JSON response from ${response.url}`,
            stage: "fetch",
            code: "HTTP_NOT_JSON",
            retryable: false,
            details: { contentType: response.contentType },
          });
        }
      }

      return {
        url: response.url,
        status: response.status,
        contentType: response.contentType,
        body,
        rawText: response.body,
      };
    },
  };
}

async function getTextFollowingRedirects(
  url: string,
  policy: AllowedFetchPolicy,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  accept: string,
  redirectCount: number,
): Promise<TextGetResult> {
  const parsed = assertAllowedUrl(url, policy);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(parsed, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: accept,
        "User-Agent": DEFAULT_USER_AGENT,
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount >= MAX_REDIRECTS) {
        throw new IngestionError({
          message: `Redirect from ${parsed.toString()} was not followable.`,
          stage: "fetch",
          code: "HTTP_REDIRECT",
          retryable: false,
          details: { status: response.status },
        });
      }
      const next = new URL(location, parsed);
      return getTextFollowingRedirects(
        next.toString(),
        policy,
        fetchImpl,
        timeoutMs,
        accept,
        redirectCount + 1,
      );
    }

    const body = await response.text();
    const contentType = response.headers.get("content-type");
    const retryAfterMs = retryAfterToMs(response.headers.get("retry-after"));

    if (response.status === 429 || response.status === 503) {
      throw new IngestionError({
        message: `Transient HTTP ${response.status} from ${parsed.toString()}`,
        stage: "fetch",
        code: `HTTP_${response.status}`,
        retryable: true,
        details: { status: response.status, retryAfterMs },
      });
    }

    if (response.status >= 500) {
      throw new IngestionError({
        message: `HTTP ${response.status} from ${parsed.toString()}`,
        stage: "fetch",
        code: `HTTP_${response.status}`,
        retryable: true,
        details: { status: response.status },
      });
    }

    if (response.status === 401 || response.status === 403) {
      throw new IngestionError({
        message: `Access restricted HTTP ${response.status} from ${parsed.toString()}`,
        stage: "fetch",
        code: `HTTP_${response.status}`,
        retryable: false,
        details: { status: response.status },
      });
    }

    if (response.status >= 400) {
      throw new IngestionError({
        message: `HTTP ${response.status} from ${parsed.toString()}`,
        stage: "fetch",
        code: `HTTP_${response.status}`,
        retryable: false,
        details: { status: response.status, bodyPreview: body.slice(0, 500) },
      });
    }

    return {
      url: parsed.toString(),
      status: response.status,
      contentType,
      body,
    };
  } catch (error) {
    if (error instanceof IngestionError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new IngestionError({
        message: `Timed out fetching ${parsed.toString()}`,
        stage: "fetch",
        code: "HTTP_TIMEOUT",
        retryable: true,
      });
    }
    throw new IngestionError({
      message:
        error instanceof Error
          ? error.message
          : `Network error fetching ${parsed.toString()}`,
      stage: "fetch",
      code: "HTTP_NETWORK",
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}
