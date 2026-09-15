const SECRET_KEY =
  /secret|password|token|authorization|api[_-]?key|private[_-]?key|webhook|dsn|service[_-]?role|credential/i;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEvent = {
  msg: string;
  job?: string;
  sourceKey?: string;
  level?: LogLevel;
  [key: string]: unknown;
};

function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) {
    return "[redacted-email]";
  }
  return `${value.slice(0, 1)}***${value.slice(at)}`;
}

function redactString(value: string): string {
  if (EMAIL_VALUE.test(value)) {
    return maskEmail(value);
  }
  if (value.length >= 24 && /^(sk_|rk_|re_|whsec_|eyJ)/.test(value)) {
    return "[redacted]";
  }
  return value;
}

export function redactLogValue(value: unknown, key?: string): unknown {
  if (key && SECRET_KEY.test(key)) {
    return value == null || value === "" ? value : "[redacted]";
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([childKey, childValue]) => [childKey, redactLogValue(childValue, childKey)],
    );
    return Object.fromEntries(entries);
  }
  return value;
}

export function structuredLog(event: LogEvent): void {
  const level = event.level ?? "info";
  const payload = redactLogValue({
    ts: new Date().toISOString(),
    ...event,
    level,
  }) as Record<string, unknown>;
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
