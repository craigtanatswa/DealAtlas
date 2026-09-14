import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { profileInsertFromAuthUser } from "@/lib/auth/profile-insert";
import { ROLES } from "@/lib/constants";

const url = process.env.DEALATLAS_DB_TEST_URL;
const anonKey = process.env.DEALATLAS_DB_TEST_ANON_KEY;
const secretKey = process.env.DEALATLAS_DB_TEST_SECRET_KEY;
const configured = Boolean(url && anonKey && secretKey);

type Json = Record<string, unknown> | Record<string, unknown>[] | null;

async function restRequest(
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Json }> {
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${url}${path}`, { ...init, headers });
  const text = await response.text();
  let body: Json = null;
  if (text) {
    body = JSON.parse(text) as Json;
  }
  return { status: response.status, body };
}

describe.skipIf(!configured)("Supabase auth integration", () => {
  const suffix = randomUUID().slice(0, 8);
  const email = `auth-${suffix}@example.com`;
  const password = "DealAtlas-auth-test-123";
  const resetPassword = "DealAtlas-auth-reset-456";
  let userId: string | undefined;
  let accessToken: string | undefined;

  beforeAll(async () => {
    const created = await restRequest(secretKey!, "/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: "Auth Test", role: "ADMIN" },
      }),
    });
    if (
      created.status >= 300 ||
      !created.body ||
      Array.isArray(created.body) ||
      typeof created.body.id !== "string"
    ) {
      throw new Error(`create user failed: ${JSON.stringify(created.body)}`);
    }
    userId = created.body.id;

    const session = await restRequest(anonKey!, "/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (
      session.status >= 300 ||
      !session.body ||
      Array.isArray(session.body) ||
      typeof session.body.access_token !== "string"
    ) {
      throw new Error(`sign-in failed: ${JSON.stringify(session.body)}`);
    }
    accessToken = session.body.access_token;
  });

  afterAll(async () => {
    if (userId) {
      await restRequest(secretKey!, `/auth/v1/admin/users/${userId}`, {
        method: "DELETE",
      });
    }
  });

  it("creates a USER profile from the database trigger even if metadata asks for ADMIN", async () => {
    const profile = await restRequest(
      secretKey!,
      `/rest/v1/profiles?id=eq.${userId}&select=id,email,display_name,role`,
    );
    expect(profile.status).toBe(200);
    expect(profile.body).toEqual([
      {
        id: userId,
        email,
        display_name: "Auth Test",
        role: ROLES.USER,
      },
    ]);
  });

  it("signs in with email and password", async () => {
    expect(accessToken).toBeTruthy();
  });

  it("blocks authenticated users from promoting themselves", async () => {
    const patched = await restRequest(
      anonKey!,
      `/rest/v1/profiles?id=eq.${userId}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ role: "ADMIN" }),
      },
    );
    expect(patched.status).toBeGreaterThanOrEqual(400);

    const profile = await restRequest(
      secretKey!,
      `/rest/v1/profiles?id=eq.${userId}&select=role`,
    );
    expect(profile.body).toEqual([{ role: ROLES.USER }]);
  });

  it("recovers a missing profile as USER, ignoring metadata role", async () => {
    const removed = await restRequest(secretKey!, `/rest/v1/profiles?id=eq.${userId}`, {
      method: "DELETE",
    });
    expect(removed.status).toBeLessThan(300);

    const insert = profileInsertFromAuthUser({
      id: userId!,
      email,
      user_metadata: { role: "ADMIN", name: "Recovered" },
    });
    expect(insert.role).toBe(ROLES.USER);

    const recovered = await restRequest(secretKey!, "/rest/v1/profiles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(insert),
    });
    expect(recovered.status).toBeLessThan(300);
    expect(recovered.body).toEqual([
      expect.objectContaining({
        id: userId,
        email,
        display_name: "Recovered",
        role: ROLES.USER,
      }),
    ]);
  });

  it("completes a password reset with a generated recovery link", async () => {
    const link = await restRequest(secretKey!, "/auth/v1/admin/generate_link", {
      method: "POST",
      body: JSON.stringify({
        type: "recovery",
        email,
      }),
    });
    expect(link.status).toBeLessThan(300);
    expect(link.body && !Array.isArray(link.body)).toBe(true);

    const body = link.body as {
      hashed_token?: string;
      email_otp?: string;
      properties?: { hashed_token?: string; email_otp?: string };
    };
    const tokenHash = body.hashed_token ?? body.properties?.hashed_token;
    expect(tokenHash, JSON.stringify(link.body)).toBeTruthy();

    const verified = await restRequest(anonKey!, "/auth/v1/verify", {
      method: "POST",
      body: JSON.stringify({
        type: "recovery",
        token_hash: tokenHash,
      }),
    });
    expect(verified.status, JSON.stringify(verified.body)).toBeLessThan(300);
    const recoveryToken = (verified.body as { access_token?: string } | null)
      ?.access_token;
    expect(recoveryToken).toBeTruthy();

    const updated = await restRequest(anonKey!, "/auth/v1/user", {
      method: "PUT",
      headers: { Authorization: `Bearer ${recoveryToken}` },
      body: JSON.stringify({ password: resetPassword }),
    });
    expect(updated.status, JSON.stringify(updated.body)).toBeLessThan(300);

    const session = await restRequest(anonKey!, "/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password: resetPassword }),
    });
    expect(session.status).toBeLessThan(300);
  });
});
