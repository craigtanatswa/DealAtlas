const PLACEHOLDER = /example\.(com|org|net)\b|placeholder|localhost|changeme|your-email/i;

const COUNT_KEYS = ["fetched", "new", "updated", "unchanged", "failed", "capped"] as const;

export function ingestAlertShouldSkip(recipient: string | undefined | null): boolean {
  const value = recipient?.trim() ?? "";
  if (!value || !value.includes("@")) {
    return true;
  }
  return PLACEHOLDER.test(value);
}

function numericFlag(value: string | undefined): 0 | 1 {
  return value === "1" ? 1 : 0;
}

function pickCounts(countsJson: string | undefined, prefix: string): Record<string, number> {
  let parsed: unknown = null;
  if (countsJson?.trim()) {
    try {
      parsed = JSON.parse(countsJson) as unknown;
    } catch {
      parsed = null;
    }
  }
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const counts: Record<string, number> = {};
  for (const key of COUNT_KEYS) {
    const value = record[key];
    counts[`${prefix}${key}`] = typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  return counts;
}

export function ingestAlertBody(input: {
  ingestCountsJson?: string;
  buildCountsJson?: string;
  ingestOk?: string;
  contractsFinderOk?: string;
  findAGrantOk?: string;
  innovateUkOk?: string;
  buildOk?: string;
  unpublishOk?: string;
  publishOk?: string;
}): string {
  return JSON.stringify({
    ...pickCounts(input.ingestCountsJson, ""),
    ...pickCounts(input.buildCountsJson, "build_"),
    ingest_ok: numericFlag(input.ingestOk),
    contracts_finder_ok: numericFlag(input.contractsFinderOk),
    find_a_grant_ok: numericFlag(input.findAGrantOk),
    innovate_uk_ok: numericFlag(input.innovateUkOk),
    build_ok: numericFlag(input.buildOk),
    unpublish_ok: numericFlag(input.unpublishOk),
    publish_ok: numericFlag(input.publishOk),
  });
}

export async function sendIngestAlert(options: {
  to: string;
  from: string | undefined;
  apiKey: string | undefined;
  ingestCountsJson?: string;
  buildCountsJson?: string;
  ingestOk?: string;
  contractsFinderOk?: string;
  findAGrantOk?: string;
  innovateUkOk?: string;
  buildOk?: string;
  unpublishOk?: string;
  publishOk?: string;
  fetchImpl?: typeof fetch;
}): Promise<"sent" | "skipped"> {
  const from = options.from?.trim() ?? "";
  if (!options.apiKey?.trim() || !from || ingestAlertShouldSkip(from) || ingestAlertShouldSkip(options.to)) {
    return "skipped";
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: options.to.trim(),
      subject: "DealAtlas open ingest",
      text: ingestAlertBody(options),
    }),
  });
  if (!response.ok) {
    throw new Error("ingest alert failed");
  }
  return "sent";
}
