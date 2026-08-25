import { getSessionConnectionId } from "@/lib/session";
import { syncConnection } from "@/lib/sync";
import { isSameOrigin, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("來源驗證失敗", 403);
  const connectionId = await getSessionConnectionId();
  if (!connectionId) return jsonError("請先連結 Threads 帳號", 401);
  const result = await syncConnection(connectionId, "manual");
  const status = result.status === "completed" ? 200 : result.status === "skipped" ? 409 : 502;
  return Response.json({ ok: result.status === "completed", result }, { status });
}
