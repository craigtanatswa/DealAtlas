const WEEK_MS = 7 * 86_400_000;

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function freshnessLabelAtRead(input: {
  now?: Date;
  createdAt?: string | null;
  updatedAt?: string | null;
  stored?: string | null;
}): string | null {
  const now = input.now?.getTime() ?? Date.now();
  const created = parseTimestamp(input.createdAt);
  const updated = parseTimestamp(input.updatedAt);

  if (created != null && now - created <= WEEK_MS) {
    return "New this week";
  }
  if (updated != null && now - updated <= WEEK_MS) {
    return "Updated this week";
  }
  if (created != null || updated != null) {
    return "Open opportunity";
  }
  return input.stored?.trim() || null;
}
