/**
 * Session cookies for HTTP probes (spec section 1.4). `createServerClient`
 * from @supabase/ssr hands `setAll` exactly the cookies the app would set
 * (`sb-<ref>-auth-token`, possibly chunked, `base64-` prefixed), so the
 * project ref is never hard-coded.
 */
import fs from "node:fs";
import path from "node:path";

import { createServerClient } from "@supabase/ssr";

import { LEAK_DIR, LEAK_PASSWORD, type LeakEnv, type LeakUsers, type SignedInRole } from "./env";
import { parseJson, send } from "./http";
import type { Role } from "./scan";

export type Session = {
  role: Role;
  cookies: Array<{ name: string; value: string }>;
  cookieHeader: string | null;
  accessToken: string | null;
  userId: string | null;
};

export const ANON_SESSION: Session = { role: "anon", cookies: [], cookieHeader: null, accessToken: null, userId: null };

export async function mintSession(env: LeakEnv, role: SignedInRole, users: LeakUsers): Promise<Session> {
  let jar: Array<{ name: string; value: string }> = [];
  const client = createServerClient(env.supabaseUrl, env.anonKey, {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => {
        const byName = new Map(jar.map((c) => [c.name, c.value]));
        for (const { name, value } of cookies) {
          if (value) byName.set(name, value);
          else byName.delete(name);
        }
        jar = [...byName].map(([name, value]) => ({ name, value }));
      },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: users[role].email, password: LEAK_PASSWORD });
  if (error || !data.session) throw new Error(`SESSION_INVALID: sign-in failed for ${role}: ${error?.message}`);
  if (jar.length === 0) throw new Error(`SESSION_INVALID: no session cookies were set for ${role}`);
  const session: Session = {
    role,
    cookies: jar,
    cookieHeader: jar.map((c) => `${c.name}=${c.value}`).join("; "),
    accessToken: data.session.access_token,
    userId: data.user.id,
  };
  fs.mkdirSync(LEAK_DIR, { recursive: true });
  fs.writeFileSync(path.join(LEAK_DIR, `cookies-${role}.json`), `${JSON.stringify(jar, null, 2)}\n`);
  const host = new URL(env.appUrl).hostname;
  fs.writeFileSync(
    path.join(LEAK_DIR, `cookies-${role}.txt`),
    ["# Netscape HTTP Cookie File", ...jar.map((c) => [host, "FALSE", "/", "FALSE", "0", c.name, c.value].join("\t"))].join(
      "\n",
    ) + "\n",
  );
  return session;
}

export const EXPECTED_PLAN: Record<Role, "FREE" | "PRO" | null> = {
  anon: null,
  free: "FREE",
  free_lapsed: "FREE",
  free_expired: "FREE",
  pro: "PRO",
};

export type SessionCheck = {
  role: Role;
  entitlementStatus: number;
  plan: string | null;
  appStatus: number;
  appLocation: string | null;
  pass: boolean;
};

/** Mandatory per role and phase: entitlement matches section 1.3 and /app is 200 with no login redirect. */
export async function checkSession(env: LeakEnv, session: Session): Promise<SessionCheck> {
  const headers: Record<string, string> = session.cookieHeader ? { cookie: session.cookieHeader } : {};
  const entitlement = await send({ method: "GET", url: `${env.appUrl}/api/billing/entitlement`, headers, followRedirects: false });
  const app = await send({ method: "GET", url: `${env.appUrl}/app`, headers, followRedirects: false });
  const plan = (parseJson(entitlement.final) as { plan?: string } | undefined)?.plan ?? null;
  const appLocation = app.final.headers.find(([name]) => name === "location")?.[1] ?? null;
  const expected = EXPECTED_PLAN[session.role];
  const pass =
    expected === null
      ? entitlement.final.status === 401 && app.final.status >= 300 && app.final.status < 400 && /\/login/.test(appLocation ?? "")
      : entitlement.final.status === 200 && plan === expected && app.final.status === 200;
  return { role: session.role, entitlementStatus: entitlement.final.status, plan, appStatus: app.final.status, appLocation, pass };
}
