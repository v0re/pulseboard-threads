import "server-only";

import { cookies } from "next/headers";
import { getConnection } from "./db";
import { getEnv } from "./env";
import { signValue, verifySignedValue } from "./crypto";

export const SESSION_COOKIE = "pulseboard_session";
export const OAUTH_STATE_COOKIE = "pulseboard_oauth_state";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 60;

type SessionPayload = { v: 1; cid: string; sv: string; iat: number; exp: number };

function parseSession(value: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<SessionPayload>;
    const now = Math.floor(Date.now() / 1000);
    if (parsed.v !== 1 || typeof parsed.cid !== "string" || !/^[0-9a-f-]{36}$/i.test(parsed.cid)) return null;
    if (typeof parsed.sv !== "string" || parsed.sv.length < 32 || parsed.sv.length > 128) return null;
    if (!Number.isInteger(parsed.iat) || !Number.isInteger(parsed.exp)) return null;
    if ((parsed.iat as number) > now + 300 || (parsed.exp as number) <= now || (parsed.exp as number) - (parsed.iat as number) > SESSION_TTL_SECONDS) return null;
    return parsed as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSessionConnectionId(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const verified = verifySignedValue(value, getEnv("SESSION_SECRET"));
  const session = verified ? parseSession(verified) : null;
  if (!session) return null;
  const connection = await getConnection(session.cid).catch(() => null);
  return connection?.session_version === session.sv ? session.cid : null;
}

export async function setSessionConnectionId(connectionId: string, sessionVersion: string): Promise<void> {
  const iat = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { v: 1, cid: connectionId, sv: sessionVersion, iat, exp: iat + SESSION_TTL_SECONDS };
  (await cookies()).set(SESSION_COOKIE, signValue(JSON.stringify(payload), getEnv("SESSION_SECRET")), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export async function setOAuthState(state: string): Promise<void> {
  (await cookies()).set(OAUTH_STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
}

export async function consumeOAuthState(): Promise<string | null> {
  const store = await cookies();
  const state = store.get(OAUTH_STATE_COOKIE)?.value ?? null;
  store.set(OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return state;
}
