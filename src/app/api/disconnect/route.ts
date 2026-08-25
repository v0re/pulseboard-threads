import { deleteConnection, recordAudit } from "@/lib/db";
import { isSameOrigin, jsonError } from "@/lib/http";
import { clearSession, getSessionConnectionId } from "@/lib/session";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("來源驗證失敗", 403);
  const connectionId = await getSessionConnectionId();
  if (!connectionId) return jsonError("沒有可刪除的連線", 401);
  await recordAudit(connectionId, "data_deletion_requested").catch(() => undefined);
  await deleteConnection(connectionId);
  await clearSession();
  return Response.redirect(new URL("/setup?deleted=1", request.url), 303);
}
