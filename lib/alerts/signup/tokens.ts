import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const CONFIRM_TTL_MS = 48 * 60 * 60 * 1000;
const UNSUBSCRIBE_TTL_SECONDS = 365 * 24 * 60 * 60;

export class AlertTokenSecretMissingError extends Error {
  constructor() {
    super("ALERT_TOKEN_SECRET is not configured");
    this.name = "AlertTokenSecretMissingError";
  }
}

function readSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const secret = env.ALERT_TOKEN_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new AlertTokenSecretMissingError();
  }
  return secret;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromB64url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    return Buffer.from(padded.replaceAll("-", "+").replaceAll("_", "/"), "base64");
  } catch {
    return null;
  }
}

export function hashAlertToken(
  token: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const secret = readSecret(env);
  return createHash("sha256")
    .update(`${secret}:${token}`, "utf8")
    .digest("hex");
}

export function mintConfirmToken(
  env: Record<string, string | undefined> = process.env,
): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    hash: hashAlertToken(token, env),
    expiresAt: new Date(Date.now() + CONFIRM_TTL_MS),
  };
}

export function mintUnsubscribeToken(
  subscriptionId: string,
  env: Record<string, string | undefined> = process.env,
  nowSeconds = Math.floor(Date.now() / 1000),
): { token: string; hash: string } {
  const secret = readSecret(env);
  const exp = nowSeconds + UNSUBSCRIBE_TTL_SECONDS;
  const payload = `v1:${subscriptionId}:${exp}`;
  const body = b64url(Buffer.from(payload, "utf8"));
  const sig = b64url(
    createHmac("sha256", secret).update(payload, "utf8").digest(),
  );
  const token = `${body}.${sig}`;
  return { token, hash: hashAlertToken(token, env) };
}

export function verifyUnsubscribeToken(
  token: string,
  env: Record<string, string | undefined> = process.env,
  nowSeconds = Math.floor(Date.now() / 1000),
): { subscriptionId: string } | null {
  const secret = readSecret(env);
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [body, sig] = parts;
  const payloadBuf = fromB64url(body);
  const sigBuf = fromB64url(sig);
  if (!payloadBuf || !sigBuf) {
    return null;
  }
  const payload = payloadBuf.toString("utf8");
  const expected = createHmac("sha256", secret).update(payload, "utf8").digest();
  if (
    expected.length !== sigBuf.length ||
    !timingSafeEqual(expected, sigBuf)
  ) {
    return null;
  }
  const match = /^v1:([0-9a-f-]{36}):(\d+)$/i.exec(payload);
  if (!match) {
    return null;
  }
  const exp = Number(match[2]);
  if (!Number.isFinite(exp) || exp < nowSeconds) {
    return null;
  }
  return { subscriptionId: match[1]! };
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function mintUserDigestUnsubscribeToken(
  userId: string,
  env: Record<string, string | undefined> = process.env,
  nowSeconds = Math.floor(Date.now() / 1000),
): { token: string; hash: string } {
  const secret = readSecret(env);
  const exp = nowSeconds + UNSUBSCRIBE_TTL_SECONDS;
  const payload = `v1u:${userId}:${exp}`;
  const body = b64url(Buffer.from(payload, "utf8"));
  const sig = b64url(
    createHmac("sha256", secret).update(payload, "utf8").digest(),
  );
  const token = `${body}.${sig}`;
  return { token, hash: hashAlertToken(token, env) };
}

export function verifyUnsubscribeTokenAny(
  token: string,
  env: Record<string, string | undefined> = process.env,
  nowSeconds = Math.floor(Date.now() / 1000),
):
  | { kind: "subscription"; subscriptionId: string }
  | { kind: "user"; userId: string }
  | null {
  const secret = readSecret(env);
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [body, sig] = parts;
  const payloadBuf = fromB64url(body);
  const sigBuf = fromB64url(sig);
  if (!payloadBuf || !sigBuf) {
    return null;
  }
  const payload = payloadBuf.toString("utf8");
  const expected = createHmac("sha256", secret).update(payload, "utf8").digest();
  if (
    expected.length !== sigBuf.length ||
    !timingSafeEqual(expected, sigBuf)
  ) {
    return null;
  }
  const sub = /^v1:([0-9a-f-]{36}):(\d+)$/i.exec(payload);
  if (sub) {
    const exp = Number(sub[2]);
    if (!Number.isFinite(exp) || exp < nowSeconds) return null;
    return { kind: "subscription", subscriptionId: sub[1]! };
  }
  const user = /^v1u:([0-9a-f-]{36}):(\d+)$/i.exec(payload);
  if (user) {
    const exp = Number(user[2]);
    if (!Number.isFinite(exp) || exp < nowSeconds) return null;
    return { kind: "user", userId: user[1]! };
  }
  return null;
}

