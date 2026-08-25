import { decryptSecret } from "@/lib/crypto";
import { consumeSearchQuota, getConnection, recordAudit } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { isSameOrigin, jsonError } from "@/lib/http";
import { getSessionConnectionId } from "@/lib/session";
import { searchPublicPosts, type SearchMode, type SearchType, ThreadsApiError } from "@/lib/threads";

type SearchBody = { query?: unknown; type?: unknown; mode?: unknown };

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("來源驗證失敗", 403);
  const connectionId = await getSessionConnectionId();
  if (!connectionId) return jsonError("請先連結 Threads 帳號", 401);
  const body = await request.json().catch(() => null) as SearchBody | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const type = (typeof body?.type === "string" ? body.type : "TOP") as SearchType;
  const mode = (typeof body?.mode === "string" ? body.mode : "KEYWORD") as SearchMode;
  if (query.length < 2 || query.length > 100) return jsonError("搜尋文字需為 2–100 個字元", 400);
  if (!["TOP", "RECENT"].includes(type) || !["KEYWORD", "TAG"].includes(mode)) return jsonError("搜尋選項無效", 400);
  if (!(await consumeSearchQuota(connectionId))) return jsonError("已達搜尋頻率上限，請稍後再試", 429);
  const connection = await getConnection(connectionId);
  if (!connection) return jsonError("Threads 連線不存在", 401);
  try {
    const posts = await searchPublicPosts(decryptSecret(connection.access_token_encrypted, getEnv("APP_ENCRYPTION_KEY")), { query, type, mode });
    await recordAudit(connectionId, "keyword_search", { queryLength: query.length, type, mode, resultCount: posts.length });
    return Response.json({ ok: true, posts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof ThreadsApiError && (error.status === 400 || error.status === 403)
      ? "此 Meta App 尚未取得公開搜尋權限；開發模式只能測試已核准的帳號。" : "Threads 搜尋暫時無法使用。";
    return jsonError(message, 502);
  }
}
