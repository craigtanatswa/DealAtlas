/**
 * A-ALERT-03/04 digest capture (OQ-4): the real evaluateAlerts render and DTO
 * path with an injected sender instead of Resend. The run's side effects
 * (new alerts, sent_at, last_digest_sent_at, saved-search evaluation marks)
 * are undone afterwards so the next phase repeats it on the same state.
 *
 *   tsx --import ./scripts/allow-server-only.mjs tests/leak/alerts-digest.ts
 */
import fs from "node:fs";
import path from "node:path";

import { evaluateAlerts } from "@/lib/alerts/evaluate";
import type { EmailMessage } from "@/lib/email/render";

import { LEAK_DIR, readLeakEnv } from "./lib/env";
import { psql, psqlJsonSql } from "./lib/probe";

function json<T>(dbUrl: string, sql: string): T[] {
  return JSON.parse(psql(dbUrl, psqlJsonSql(sql)) || "[]") as T[];
}

function literal(value: string | null): string {
  return value === null ? "null" : `'${value.replace(/'/g, "''")}'`;
}

export async function runDigest(): Promise<{ messages: EmailMessage[]; result: unknown }> {
  const env = readLeakEnv();
  const alertIds = json<{ id: string }>(env.dbUrl, `select id from public.alerts`).map((r) => r.id);
  const unsent = json<{ id: string }>(env.dbUrl, `select id from public.alerts where sent_at is null`).map((r) => r.id);
  const prefs = json<{ user_id: string; last_digest_sent_at: string | null }>(env.dbUrl, `select user_id, last_digest_sent_at from public.notification_preferences`);
  const searches = json<{ id: string; last_evaluated_at: string | null }>(env.dbUrl, `select id, last_evaluated_at from public.saved_searches`);

  const messages: EmailMessage[] = [];
  let result: unknown;
  try {
    result = await evaluateAlerts({
      appUrl: env.appUrl,
      sender: {
        async send(message) {
          messages.push(message);
          return { id: `leak-capture-${messages.length}`, skipped: false };
        },
      },
    });
  } finally {
    const ids = (list: string[]) => (list.length ? list.map((id) => `'${id}'`).join(",") : "null");
    psql(env.dbUrl, `delete from public.alerts where id not in (${ids(alertIds)})`);
    if (unsent.length) psql(env.dbUrl, `update public.alerts set sent_at = null where id in (${ids(unsent)})`);
    for (const p of prefs) {
      psql(env.dbUrl, `update public.notification_preferences set last_digest_sent_at = ${literal(p.last_digest_sent_at)} where user_id = '${p.user_id}'`);
    }
    for (const s of searches) {
      psql(env.dbUrl, `update public.saved_searches set last_evaluated_at = ${literal(s.last_evaluated_at)} where id = '${s.id}'`);
    }
  }
  return { messages, result };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runDigest()
    .then(({ messages, result }) => {
      fs.mkdirSync(LEAK_DIR, { recursive: true });
      fs.writeFileSync(path.join(LEAK_DIR, "digest.json"), `${JSON.stringify({ result, messages }, null, 2)}\n`);
      console.log(`captured ${messages.length} digest message(s)`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
