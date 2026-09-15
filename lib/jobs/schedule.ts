const CRON_FIELD = /^(\*|\*\/\d+|\d+)$/;

export type CronExpression = {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
};

type CronField = { any: true } | { step: number } | { exact: number };

function parseField(value: string, min: number, max: number): CronField {
  if (!CRON_FIELD.test(value)) {
    throw new Error(`Unsupported cron field: ${value}`);
  }
  if (value === "*") {
    return { any: true };
  }
  if (value.startsWith("*/")) {
    const step = Number(value.slice(2));
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`Invalid cron step: ${value}`);
    }
    return { step };
  }
  const exact = Number(value);
  if (!Number.isInteger(exact) || exact < min || exact > max) {
    throw new Error(`Cron field out of range: ${value}`);
  }
  return { exact };
}

export function parseCronExpression(expression: string): CronExpression {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields: ${expression}`);
  }
  return {
    minute: parseField(parts[0] ?? "*", 0, 59),
    hour: parseField(parts[1] ?? "*", 0, 23),
    dayOfMonth: parseField(parts[2] ?? "*", 1, 31),
    month: parseField(parts[3] ?? "*", 1, 12),
    dayOfWeek: parseField(parts[4] ?? "*", 0, 6),
  };
}

function matchesField(field: CronField, value: number): boolean {
  if ("any" in field) {
    return true;
  }
  if ("step" in field) {
    return value % field.step === 0;
  }
  return value === field.exact;
}

export function cronMatches(expression: string, at: Date): boolean {
  const cron = parseCronExpression(expression);
  return (
    matchesField(cron.minute, at.getUTCMinutes()) &&
    matchesField(cron.hour, at.getUTCHours()) &&
    matchesField(cron.dayOfMonth, at.getUTCDate()) &&
    matchesField(cron.month, at.getUTCMonth() + 1) &&
    matchesField(cron.dayOfWeek, at.getUTCDay())
  );
}

export function previousCronTick(
  expression: string,
  now: Date,
): Date | null {
  parseCronExpression(expression);
  const cursor = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      0,
      0,
    ),
  );
  const horizon = 60 * 24 * 14;
  for (let step = 0; step < horizon; step += 1) {
    if (cronMatches(expression, cursor)) {
      return cursor;
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() - 1);
  }
  return null;
}

export function estimatedIntervalMs(expression: string): number | null {
  try {
    const cron = parseCronExpression(expression);
    if ("step" in cron.hour && cron.minute && "exact" in cron.minute) {
      return cron.hour.step * 60 * 60 * 1000;
    }
    if ("step" in cron.minute) {
      return cron.minute.step * 60 * 1000;
    }
    if ("exact" in cron.hour && "exact" in cron.minute && "any" in cron.dayOfMonth) {
      return 24 * 60 * 60 * 1000;
    }
  } catch {
    return null;
  }
  return 24 * 60 * 60 * 1000;
}

export function isSourceDue(input: {
  scheduleExpression: string | null;
  lastSuccessAt: string | null;
  now: Date;
  force?: boolean;
}): boolean {
  if (input.force) {
    return true;
  }
  if (!input.scheduleExpression) {
    return false;
  }
  if (!input.lastSuccessAt) {
    return true;
  }
  const tick = previousCronTick(input.scheduleExpression, input.now);
  if (!tick) {
    return false;
  }
  return Date.parse(input.lastSuccessAt) < tick.getTime();
}

export function isSourceStale(input: {
  enabled: boolean;
  scheduleExpression: string | null;
  lastSuccessAt: string | null;
  now: Date;
  staleAfterMs?: number;
}): boolean {
  if (!input.enabled) {
    return false;
  }
  const fallback = input.staleAfterMs ?? 48 * 60 * 60 * 1000;
  const interval = input.scheduleExpression
    ? estimatedIntervalMs(input.scheduleExpression)
    : fallback;
  const threshold = Math.max(fallback, (interval ?? fallback) * 2);
  if (!input.lastSuccessAt) {
    return true;
  }
  return input.now.getTime() - Date.parse(input.lastSuccessAt) > threshold;
}

export function minFetchIntervalMs(rateLimitPerMinute: number | null): number {
  if (!rateLimitPerMinute || rateLimitPerMinute <= 0) {
    return 0;
  }
  return Math.ceil(60_000 / rateLimitPerMinute);
}
