import { AUTO_REPLY_LIMIT_OPTIONS, getAutoReplySettings, saveAutoReplySettings } from "@/lib/auto-reply-db";
import { getConnection, recordAudit } from "@/lib/db";
import { isSameOrigin, jsonError } from "@/lib/http";
import { isOpenAIConfigured, verifyOpenAIAutoReply } from "@/lib/openai";
import { getSessionConnectionId } from "@/lib/session";
import { AUTO_REPLY_SCOPES } from "@/lib/threads";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("來源驗證失敗", 403);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 2_048) return jsonError("請求內容過大", 413);
  const connectionId = await getSessionConnectionId();
  if (!connectionId) return jsonError("請先連結 Threads 帳號", 401);
  const connection = await getConnection(connectionId);
  if (!connection) return jsonError("Threads 連線不存在", 404);

  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("設定格式無效", 400); }
  if (!body || typeof body !== "object") return jsonError("設定格式無效", 400);
  const { enabled, dailyLimit } = body as Record<string, unknown>;
  if (typeof enabled !== "boolean" || typeof dailyLimit !== "number" || !AUTO_REPLY_LIMIT_OPTIONS.includes(dailyLimit as 3 | 5 | 10)) {
    return jsonError("設定值無效", 400);
  }
  if (enabled && !isOpenAIConfigured()) return jsonError("伺服器尚未設定 OpenAI 金鑰", 503);
  const missingScopes = AUTO_REPLY_SCOPES.filter((scope) => !connection.granted_scopes.includes(scope));
  if (enabled && missingScopes.length) return Response.json({ ok: false, error: "請重新授權 Threads 新權限", missingScopes }, { status: 409 });

  if (enabled) {
    try { await getAutoReplySettings(connectionId); }
    catch { return jsonError("自動回覆資料表尚未完成設定，請先執行資料庫 migration", 503); }
    try { await verifyOpenAIAutoReply(); }
    catch {
      return jsonError("OpenAI API 尚未啟用計費、模型權限不足，或服務暫時不可用", 503);
    }
  }

  let settings;
  try {
    settings = await saveAutoReplySettings(connectionId, enabled, dailyLimit);
  } catch {
    return jsonError("自動回覆資料表尚未完成設定，請先執行資料庫 migration", 503);
  }
  await recordAudit(connectionId, enabled ? "auto_reply_enabled" : "auto_reply_disabled", { dailyLimit }).catch(() => undefined);
  return Response.json({ ok: true, settings });
}
