import { getThreadsRedirectUri, isAppConfigured, isProductionReady } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { setOAuthState } from "@/lib/session";
import { buildAuthorizationUrl } from "@/lib/threads";

export async function GET(request: Request) {
  if (!isAppConfigured() || (process.env.NODE_ENV === "production" && !isProductionReady())) return Response.redirect(new URL("/setup?error=not_configured", request.url));
  const state = randomToken();
  await setOAuthState(state);
  return Response.redirect(buildAuthorizationUrl(getThreadsRedirectUri(request.url), state));
}
