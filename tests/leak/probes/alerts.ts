/** Rendered alert email (A-ALERT-03/04, OQ-4) and the local mail catcher (A-ALERT-05). */
import { runDigest } from "../alerts-digest";
import { writeJson } from "../lib/artifacts";
import { LEAK_PASSWORD } from "../lib/env";
import { parseJson, send, sleep } from "../lib/http";
import type { Ctx } from "../lib/probe";
import { eq, ok } from "../lib/probe";
import { FREE_ROLES, type Role } from "../lib/scan";
import { previewTitles } from "./web";

function emailText(m: { subject: string; text: string; html: string }): string {
  return `Subject: ${m.subject}\n\n${m.text}\n\n${m.html}`;
}

export async function digestProbes(ctx: Ctx): Promise<void> {
  const b1Title = previewTitles(ctx).get("B1") ?? "";
  let captured: Awaited<ReturnType<typeof runDigest>>;
  try {
    captured = await runDigest();
  } catch (error) {
    ctx.derive({ id: "ALERT-03", instance: "digest-run", role: "db", assertions: [ok("digest_ran", false, String(error))] });
    return;
  }
  writeJson(`${ctx.dir}/digest-result.json`, captured.result);
  const byRole = (role: Role) => captured.messages.filter((m) => m.to.toLowerCase() === ctx.users[role as Exclude<Role, "anon">].email);
  for (const role of FREE_ROLES) {
    const messages = byRole(role);
    ctx.derive({ id: "ALERT-03", instance: "one-message", role, assertions: [eq("messages", 1, messages.length)] });
    messages.forEach((m, i) =>
      ctx.capture({
        id: "ALERT-03",
        instance: `digest-${i}`,
        role,
        text: emailText(m),
        check: (scan) => [ok("B1_preview_title_present", scan.layers.L5.includes(b1Title.toLowerCase()), b1Title)],
      }),
    );
  }
  const pro = byRole("pro");
  ctx.derive({ id: "ALERT-04", instance: "one-message", role: "pro", assertions: [eq("messages", 1, pro.length)] });
  pro.forEach((m, i) =>
    ctx.capture({
      id: "ALERT-04",
      instance: `digest-${i}`,
      role: "pro",
      text: emailText(m),
      check: (scan) => [ok("finds:T01", scan.tokens.has("T01"), [...scan.tokens.keys()]), ok("finds:T03", scan.tokens.has("T03"), [...scan.tokens.keys()])],
    }),
  );
}

type MailMessage = { id: string; to: string[]; subject: string; text: string; html: string };

async function readMail(ctx: Ctx): Promise<{ kind: "mailpit" | "inbucket" | "none"; messages: MailMessage[]; error?: string }> {
  const base = ctx.env.mailUrl;
  try {
    const list = await send({ method: "GET", url: `${base}/api/v1/messages?limit=200` });
    if (list.final.status === 200) {
      const body = parseJson(list.final) as { messages?: Array<{ ID: string }> } | undefined;
      const messages: MailMessage[] = [];
      for (const summary of body?.messages ?? []) {
        const one = parseJson((await send({ method: "GET", url: `${base}/api/v1/message/${summary.ID}` })).final) as
          | { ID: string; To?: Array<{ Address: string }>; Subject?: string; Text?: string; HTML?: string }
          | undefined;
        if (one) messages.push({ id: one.ID, to: (one.To ?? []).map((t) => t.Address.toLowerCase()), subject: one.Subject ?? "", text: one.Text ?? "", html: one.HTML ?? "" });
      }
      return { kind: "mailpit", messages };
    }
  } catch (error) {
    return { kind: "none", messages: [], error: String(error) };
  }
  const messages: MailMessage[] = [];
  for (const user of Object.values(ctx.users)) {
    const box = user.email.split("@")[0];
    const list = await send({ method: "GET", url: `${base}/api/v1/mailbox/${box}` });
    for (const summary of (parseJson(list.final) as Array<{ id: string }> | undefined) ?? []) {
      const one = parseJson((await send({ method: "GET", url: `${base}/api/v1/mailbox/${box}/${summary.id}` })).final) as
        | { id: string; subject?: string; body?: { text?: string; html?: string } }
        | undefined;
      if (one) messages.push({ id: one.id, to: [user.email], subject: one.subject ?? "", text: one.body?.text ?? "", html: one.body?.html ?? "" });
    }
  }
  return { kind: messages.length ? "inbucket" : "none", messages };
}

/** ALERT-05: auth emails (recovery; signup sends none while confirmations are off) are NT. */
export async function mailProbes(ctx: Ctx): Promise<void> {
  const before = new Set((await readMail(ctx)).messages.map((m) => m.id));
  const authHeaders = { apikey: ctx.env.anonKey, "content-type": "application/json" };
  const recover = await send({
    method: "POST",
    url: `${ctx.env.supabaseUrl}/auth/v1/recover`,
    headers: authHeaders,
    body: JSON.stringify({ email: ctx.users.free.email }),
  });
  const signupEmail = `leakprobe-signup-${ctx.phase.toLowerCase()}@example.com`;
  const signup = await send({
    method: "POST",
    url: `${ctx.env.supabaseUrl}/auth/v1/signup`,
    headers: authHeaders,
    body: JSON.stringify({ email: signupEmail, password: LEAK_PASSWORD }),
  });
  const signupUser = (parseJson(signup.final) as { id?: string; user?: { id?: string } } | undefined) ?? {};
  let fresh: MailMessage[] = [];
  let mail: Awaited<ReturnType<typeof readMail>> = { kind: "none", messages: [] };
  for (let i = 0; i < 20; i += 1) {
    mail = await readMail(ctx);
    fresh = mail.messages.filter((m) => !before.has(m.id));
    if (fresh.some((m) => m.to.includes(ctx.users.free.email))) break;
    await sleep(500);
  }
  const signupId = signupUser.user?.id ?? signupUser.id;
  if (signupId) {
    await send({
      method: "DELETE",
      url: `${ctx.env.supabaseUrl}/auth/v1/admin/users/${signupId}`,
      headers: { apikey: ctx.env.secretKey, authorization: `Bearer ${ctx.env.secretKey}` },
    });
  }
  ctx.derive({
    id: "ALERT-05",
    instance: "mail-catcher",
    role: "free",
    assertions: [
      ok("recover_accepted", recover.final.status === 200, recover.final.status),
      ok("mail_catcher_reachable", mail.kind !== "none", mail.error ?? mail.kind),
      ok("recovery_email_captured", fresh.some((m) => m.to.includes(ctx.users.free.email)), fresh.map((m) => m.to)),
      { id: "signup_email_captured", pass: true, blocking: false, actual: fresh.some((m) => m.to.includes(signupEmail)) },
    ],
    detail: { catcher: mail.kind, signup_status: signup.final.status },
  });
  for (const m of fresh) {
    ctx.capture({ id: "ALERT-05", instance: `${m.to.join(",")}:${m.subject}`, role: m.to.includes(ctx.users.free.email) ? "free" : "anon", text: emailText(m) });
  }
}
