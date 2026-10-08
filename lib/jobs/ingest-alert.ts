const PLACEHOLDER = /example\.(com|org|net)\b|placeholder|localhost|changeme|your-email/i;

export function ingestAlertShouldSkip(recipient: string | undefined | null): boolean {
  const value = recipient?.trim() ?? "";
  if (!value || !value.includes("@")) {
    return true;
  }
  return PLACEHOLDER.test(value);
}

export function ingestAlertBody(countsJson: string | undefined): string {
  let parsed: unknown = null;
  if (countsJson?.trim()) {
    try {
      parsed = JSON.parse(countsJson) as unknown;
    } catch {
      parsed = null;
    }
  }
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const count = (key: string) => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  return JSON.stringify({
    fetched: count("fetched"),
    new: count("new"),
    updated: count("updated"),
    unchanged: count("unchanged"),
    failed: count("failed"),
  });
}

export async function sendIngestAlert(options: {
  to: string;
  from: string | undefined;
  apiKey: string | undefined;
  countsJson: string | undefined;
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
      text: ingestAlertBody(options.countsJson),
    }),
  });
  if (!response.ok) {
    throw new Error("ingest alert failed");
  }
  return "sent";
}
