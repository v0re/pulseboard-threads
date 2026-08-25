import { randomUUID, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { encryptSecret, randomToken } from "@/lib/crypto";
import { recordAudit, upsertConnection } from "@/lib/db";
import { getAllowedThreadsUserIds, getEnv, getThreadsRedirectUri } from "@/lib/env";
import { consumeOAuthState, setSessionConnectionId } from "@/lib/session";
import { syncConnection } from "@/lib/sync";
import { exchangeCodeForToken, exchangeForLongLivedToken, getProfile, THREADS_SCOPES } from "@/lib/threads";

export const maxDuration = 300;

function sameValue(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return Response.redirect(new URL("/setup?error=oauth_denied", request.url));
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const expectedState = await consumeOAuthState();
  if (!code || !returnedState || !expectedState || !sameValue(returnedState, expectedState)) return Response.redirect(new URL("/setup?error=invalid_state", request.url));

  try {
    const short = await exchangeCodeForToken(code, getThreadsRedirectUri(request.url));
    const long = await exchangeForLongLivedToken(short.accessToken);
    const profile = await getProfile(long.accessToken);
    if (String(profile.id) !== String(short.userId)) throw new Error("Threads 帳號識別不一致");
    const allowed = getAllowedThreadsUserIds();
    if (allowed.size && !allowed.has(String(profile.id))) return Response.redirect(new URL("/setup?error=not_allowed", request.url));
    const sessionVersion = randomToken();
    const connectionId = await upsertConnection({
      id: randomUUID(), profile, encryptedToken: encryptSecret(long.accessToken, getEnv("APP_ENCRYPTION_KEY")),
      tokenExpiresAt: new Date(Date.now() + long.expiresIn * 1000), scopes: [...THREADS_SCOPES], sessionVersion,
    });
    await setSessionConnectionId(connectionId, sessionVersion);
    await recordAudit(connectionId, "oauth_connected", { scopes: [...THREADS_SCOPES] });
    after(async () => { await syncConnection(connectionId, "oauth", 25); });
    return Response.redirect(new URL("/?connected=1", request.url));
  } catch {
    return Response.redirect(new URL("/setup?error=oauth_failed", request.url));
  }
}
