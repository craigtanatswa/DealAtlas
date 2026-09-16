import type { SupabaseTestEnv } from "./env";

export async function restRequest(
  env: SupabaseTestEnv,
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown; text: string }> {
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${env.url}${path}`, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  return { status: response.status, body, text };
}

export async function requireOk(
  env: SupabaseTestEnv,
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const result = await restRequest(env, key, path, init);
  if (result.status >= 300) {
    throw new Error(`${path} failed (${result.status}): ${result.text}`);
  }
  return result.body;
}
