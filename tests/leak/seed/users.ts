/**
 * Creates the four leak-probe users through the local GoTrue admin API and
 * writes their ids to .leak/users.json (spec 1.2 step 2). Local stack only.
 *
 *   tsx tests/leak/seed/users.ts
 */
import fs from "node:fs";
import path from "node:path";

import { LEAK_DIR, LEAK_PASSWORD, LEAK_USERS, readLeakEnv, type LeakUsers } from "../lib/env";

async function admin(env: ReturnType<typeof readLeakEnv>, pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${env.supabaseUrl}/auth/v1${pathname}`, {
    ...init,
    headers: {
      apikey: env.secretKey,
      Authorization: `Bearer ${env.secretKey}`,
      "Content-Type": "application/json",
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

async function main() {
  const env = readLeakEnv();
  const users = {} as LeakUsers;
  for (const [role, email] of Object.entries(LEAK_USERS) as Array<[keyof LeakUsers, string]>) {
    const created = await admin(env, "/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password: LEAK_PASSWORD, email_confirm: true }),
    });
    if (created.status >= 300 || typeof created.body.id !== "string") {
      throw new Error(`creating ${role} failed: ${created.status} ${JSON.stringify(created.body)}`);
    }
    users[role] = { id: created.body.id, email };
  }
  fs.mkdirSync(LEAK_DIR, { recursive: true });
  fs.writeFileSync(path.join(LEAK_DIR, "users.json"), `${JSON.stringify(users, null, 2)}\n`);
  for (const [role, user] of Object.entries(users)) {
    console.log(`${role}_id=${user.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
