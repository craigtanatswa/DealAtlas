import { errorMessage, structuredLog } from "@/lib/observability/log";

export type ErrorContext = Record<string, unknown>;

export type ErrorReporter = {
  configured: boolean;
  captureException(error: unknown, context?: ErrorContext): Promise<void>;
  captureMessage(
    message: string,
    context?: ErrorContext & { level?: "info" | "warning" | "error" },
  ): Promise<void>;
};

export type ParsedSentryDsn = {
  publicKey: string;
  host: string;
  projectId: string;
  envelopeUrl: string;
};

const SENTRY_DSN =
  /^(https?):\/\/([A-Za-z0-9._-]+)(?::[^@]+)?@([^/]+)\/(\d+)$/i;

export function parseSentryDsn(dsn: string): ParsedSentryDsn | null {
  const match = SENTRY_DSN.exec(dsn.trim());
  if (!match) {
    return null;
  }
  const [, protocol, publicKey, host, projectId] = match;
  return {
    publicKey,
    host,
    projectId,
    envelopeUrl: `${protocol}://${host}/api/${projectId}/envelope/`,
  };
}

function eventId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function exceptionPayload(error: unknown, context?: ErrorContext) {
  const errorObject =
    error instanceof Error ? error : new Error(errorMessage(error));
  return {
    exception: {
      values: [
        {
          type: errorObject.name,
          value: errorObject.message,
          stacktrace: errorObject.stack
            ? {
                frames: errorObject.stack
                  .split("\n")
                  .slice(0, 40)
                  .map((line) => ({ filename: line.trim() })),
              }
            : undefined,
        },
      ],
    },
    extra: context ?? {},
    tags: {
      job: typeof context?.job === "string" ? context.job : undefined,
    },
  };
}

async function postSentryEnvelope(
  parsed: ParsedSentryDsn,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<void> {
  const envelopeId = eventId();
  const header = JSON.stringify({
    event_id: envelopeId,
    sent_at: new Date().toISOString(),
  });
  const item = JSON.stringify({
    type: "event",
    content_type: "application/json",
  });
  const body = `${header}\n${item}\n${JSON.stringify({
    event_id: envelopeId,
    timestamp: Date.now() / 1000,
    platform: "node",
    sdk: { name: "dealatlas.sentry-compatible", version: "0.1.0" },
    ...payload,
  })}`;

  const response = await fetchImpl(parsed.envelopeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=dealatlas/0.1.0, sentry_key=${parsed.publicKey}`,
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Sentry envelope failed with HTTP ${response.status}`);
  }
}

export function createErrorReporter(options?: {
  dsn?: string | null;
  fetchImpl?: typeof fetch;
}): ErrorReporter {
  const dsn = options && "dsn" in options ? options.dsn : process.env.SENTRY_DSN;
  const parsed = dsn ? parseSentryDsn(dsn) : null;
  const fetchImpl = options?.fetchImpl ?? fetch;

  if (!parsed) {
    return {
      configured: false,
      async captureException(error, context) {
        structuredLog({
          msg: "exception",
          level: "error",
          error: errorMessage(error),
          ...context,
        });
      },
      async captureMessage(message, context) {
        const { level: sentryLevel, ...rest } = context ?? {};
        structuredLog({
          ...rest,
          msg: message,
          level:
            sentryLevel === "warning"
              ? "warn"
              : sentryLevel === "error"
                ? "error"
                : "info",
        });
      },
    };
  }

  return {
    configured: true,
    async captureException(error, context) {
      structuredLog({
        msg: "exception",
        level: "error",
        error: errorMessage(error),
        monitoring: "sentry",
        ...context,
      });
      try {
        await postSentryEnvelope(
          parsed,
          exceptionPayload(error, context),
          fetchImpl,
        );
      } catch (sendError) {
        structuredLog({
          msg: "monitoring_delivery_failed",
          level: "warn",
          error: errorMessage(sendError),
          job: typeof context?.job === "string" ? context.job : undefined,
        });
      }
    },
    async captureMessage(message, context) {
      const { level: sentryLevel, ...rest } = context ?? {};
      structuredLog({
        ...rest,
        msg: message,
        level:
          sentryLevel === "warning"
            ? "warn"
            : sentryLevel === "error"
              ? "error"
              : "info",
        monitoring: "sentry",
      });
      try {
        await postSentryEnvelope(
          parsed,
          {
            message,
            level: context?.level ?? "info",
            extra: context ?? {},
          },
          fetchImpl,
        );
      } catch (sendError) {
        structuredLog({
          msg: "monitoring_delivery_failed",
          level: "warn",
          error: errorMessage(sendError),
        });
      }
    },
  };
}

export function monitoringConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.SENTRY_DSN && parseSentryDsn(env.SENTRY_DSN));
}
