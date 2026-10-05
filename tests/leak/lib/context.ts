import { readLeakEnv, readUsers, type SignedInRole } from "./env";
import { setAppOrigin } from "./http";
import { Ctx, type Phase } from "./probe";
import { loadManifest, type Role } from "./scan";
import { ANON_SESSION, checkSession, mintSession, type Session, type SessionCheck } from "./session";

export const SIGNED_IN: SignedInRole[] = ["free", "free_lapsed", "free_expired", "pro"];

/** Env guard, manifest, users and freshly minted sessions for one phase (spec 1.2 steps 7 and 10). */
export async function loadContext(phase: Phase): Promise<{ ctx: Ctx; checks: SessionCheck[] }> {
  const env = readLeakEnv();
  setAppOrigin(env.appUrl);
  const manifest = loadManifest();
  const users = readUsers();
  const sessions = new Map<Role, Session>([["anon", ANON_SESSION]]);
  for (const role of SIGNED_IN) sessions.set(role, await mintSession(env, role, users));
  const checks: SessionCheck[] = [];
  for (const session of sessions.values()) checks.push(await checkSession(env, session));
  return { ctx: new Ctx(phase, env, manifest, users, sessions), checks };
}
