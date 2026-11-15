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

function warningCount(value: string | undefined): number {
  const raw = value?.trim();
  if (!raw) {
    return 0;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null) {
      return 0;
    }
    if (Array.isArray(parsed)) {
      return parsed.length;
    }
    if (typeof parsed === "string") {
      return parsed.trim() ? 1 : 0;
    }
    if (typeof parsed === "object") {
      return 1;
    }
    return parsed ? 1 : 0;
  } catch {
    // A plain marker such as "TLS_CERT_ERROR" still counts as one warning.
  }
  return 1;
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
  publicContractsScotlandOk?: string;
  publicContractsScotlandWarnings?: string;
  sell2WalesOk?: string;
  sell2WalesWarnings?: string;
  tedOk?: string;
  findAGrantOk?: string;
  innovateUkOk?: string;
  gcaAgreementsOk?: string;
  gcaPipelineOk?: string;
  ukInfrastructurePipelineOk?: string;
  buildOk?: string;
  unpublishOk?: string;
  publishOk?: string;
}): string {
  const body: Record<string, unknown> = {
    ...pickCounts(input.ingestCountsJson, ""),
    ...pickCounts(input.buildCountsJson, "build_"),
    ingest_ok: numericFlag(input.ingestOk),
    contracts_finder_ok: numericFlag(input.contractsFinderOk),
    public_contracts_scotland_ok: numericFlag(input.publicContractsScotlandOk),
    sell2wales_ok: numericFlag(input.sell2WalesOk),
    ted_ok: numericFlag(input.tedOk),
    find_a_grant_ok: numericFlag(input.findAGrantOk),
    innovate_uk_ok: numericFlag(input.innovateUkOk),
    gca_agreements_ok: numericFlag(input.gcaAgreementsOk),
    gca_pipeline_ok: numericFlag(input.gcaPipelineOk),
    uk_infrastructure_pipeline_ok: numericFlag(input.ukInfrastructurePipelineOk),
    build_ok: numericFlag(input.buildOk),
    unpublish_ok: numericFlag(input.unpublishOk),
    publish_ok: numericFlag(input.publishOk),
  };
  if (warningCount(input.publicContractsScotlandWarnings) > 0) {
    body.public_contracts_scotland_ok = 0;
    body.public_contracts_scotland_status = "warning";
  }
  if (warningCount(input.sell2WalesWarnings) > 0) {
    body.sell2wales_ok = 0;
    body.sell2wales_status = "warning";
  }
  return JSON.stringify(body);
}

export async function sendIngestAlert(options: {
  to: string;
  from: string | undefined;
  apiKey: string | undefined;
  ingestCountsJson?: string;
  buildCountsJson?: string;
  ingestOk?: string;
  contractsFinderOk?: string;
  publicContractsScotlandOk?: string;
  publicContractsScotlandWarnings?: string;
  sell2WalesOk?: string;
  sell2WalesWarnings?: string;
  tedOk?: string;
  findAGrantOk?: string;
  innovateUkOk?: string;
  gcaAgreementsOk?: string;
  gcaPipelineOk?: string;
  ukInfrastructurePipelineOk?: string;
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
