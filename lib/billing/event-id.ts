import { createHash } from "node:crypto";

export function hashWebhookPayload(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function providerEventId(input: {
  webhookId: string | null | undefined;
  eventType: string;
  payloadHash: string;
  occurredAt: string | null;
  subscriptionId?: string | null;
  paymentId?: string | null;
}): string {
  const headerId = input.webhookId?.trim();
  if (headerId) {
    return headerId;
  }

  const parts = [
    input.eventType,
    input.occurredAt ?? "",
    input.subscriptionId ?? "",
    input.paymentId ?? "",
    input.payloadHash,
  ];
  return `dodo:${createHash("sha256").update(parts.join("|")).digest("hex")}`;
}

export function toIsoDate(
  value: Date | string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function isNewerProviderEvent(
  incomingIso: string | null,
  storedIso: string | null,
): boolean {
  if (!incomingIso) {
    return storedIso == null;
  }
  if (!storedIso) {
    return true;
  }
  return Date.parse(incomingIso) >= Date.parse(storedIso);
}
