import { isProductionReady, optionalEnv } from "@/lib/env";
import { syncAllConnections } from "@/lib/sync";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  if (!isProductionReady()) return Response.json({ ok: false, skipped: true, reason: "not_configured" }, { status: 503 });
  const { results, truncated } = await syncAllConnections(Date.now() + 270_000);
  const ok = !truncated && results.every((item) => item.status !== "failed");
  return Response.json({ ok, truncated, results }, { status: ok ? 200 : 502 });
}
