import "server-only";

import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto";
import {
  acquireSyncLock, finishSyncRun, getConnection, listConnections, markConnectionSynced, markMissingPostsUnavailable, releaseSyncLock,
  pruneOldData, startSyncRun, updateConnectionToken, upsertAccountSnapshot, upsertPost, upsertPostSnapshot,
} from "./db";
import { getEnv, getSyncPostLimit, optionalEnv } from "./env";
import { getAccountInsights, getOwnPosts, getPostInsights, refreshLongLivedToken, ThreadsApiError } from "./threads";
import type { PostMetrics } from "./types";

export type SyncSource = "oauth" | "manual" | "cron";
export type SyncResult = { connectionId: string; status: "completed" | "failed" | "skipped"; postsSeen: number; apiCalls: number; message?: string };

function publicError(error: unknown): { code: string; message: string } {
  if (error instanceof ThreadsApiError) return { code: String(error.code ?? error.status), message: error.status === 401 ? "Threads 授權已失效，請重新連結帳號。" : "Threads API 暫時無法完成同步。" };
  if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) return { code: "SYNC_DEADLINE", message: "同步已在安全時間上限前停止，系統會在下次排程繼續。" };
  return { code: "SYNC_ERROR", message: "同步期間發生伺服器錯誤，請檢查部署記錄。" };
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, controller: AbortController, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  let firstError: unknown;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length && !controller.signal.aborted) {
      const index = cursor;
      cursor += 1;
      try {
        await worker(items[index]);
      } catch (error) {
        firstError ??= error;
        if (!controller.signal.aborted) controller.abort(error);
      }
    }
  });
  await Promise.allSettled(workers);
  if (firstError) throw firstError;
  if (controller.signal.aborted) throw controller.signal.reason ?? new DOMException("Aborted", "AbortError");
}

async function maybeRefreshToken(connectionId: string, encryptedToken: string, expiresAtValue: string | Date, refreshedAtValue: string | Date, versionValue: string | number, signal: AbortSignal): Promise<string> {
  const secret = getEnv("APP_ENCRYPTION_KEY");
  const currentToken = decryptSecret(encryptedToken, secret);
  const expiresAt = new Date(expiresAtValue).getTime();
  const refreshedAt = new Date(refreshedAtValue).getTime();
  const tenDays = 10 * 24 * 60 * 60 * 1000;
  const oneDay = 24 * 60 * 60 * 1000;
  if (expiresAt - Date.now() > tenDays || Date.now() - refreshedAt < oneDay) return currentToken;
  const refreshed = await refreshLongLivedToken(currentToken, signal);
  const updated = await updateConnectionToken(connectionId, Number(versionValue), encryptSecret(refreshed.accessToken, secret), new Date(Date.now() + refreshed.expiresIn * 1000));
  if (!updated) {
    const latest = await getConnection(connectionId);
    if (!latest) throw new Error("Threads 連線已不存在");
    return decryptSecret(latest.access_token_encrypted, secret);
  }
  return refreshed.accessToken;
}

export async function syncConnection(connectionId: string, source: SyncSource, maxPosts = getSyncPostLimit(), deadlineAt = Date.now() + 270_000): Promise<SyncResult> {
  const runId = randomUUID();
  const controller = new AbortController();
  const deadlineTimer = setTimeout(
    () => controller.abort(new DOMException("同步超過內部時間預算", "TimeoutError")),
    Math.max(deadlineAt - Date.now(), 1),
  );
  let postsSeen = 0;
  let apiCalls = 0;
  let runStarted = false;
  let locked = false;
  let connectionExists = false;
  try {
    const connection = await getConnection(connectionId);
    if (!connection) throw new Error("找不到 Threads 連線");
    connectionExists = true;
    await startSyncRun(runId, connectionId, source);
    runStarted = true;
    locked = await acquireSyncLock(connectionId, runId);
    if (!locked) {
      await finishSyncRun(runId, { status: "skipped", errorCode: "LOCKED", errorMessage: "已有同步正在執行" });
      return { connectionId, status: "skipped", postsSeen: 0, apiCalls: 0, message: "已有同步正在執行" };
    }
    const accessToken = await maybeRefreshToken(connectionId, connection.access_token_encrypted, connection.token_expires_at, connection.token_refreshed_at, connection.token_version, controller.signal);
    const capturedOn = new Date().toISOString().slice(0, 10);
    const sourceResults = await Promise.allSettled([
      getOwnPosts(accessToken, maxPosts, controller.signal).catch((error) => { if (!controller.signal.aborted) controller.abort(error); throw error; }),
      getAccountInsights(accessToken, controller.signal).catch((error) => { if (!controller.signal.aborted) controller.abort(error); throw error; }),
    ]);
    const rejectedSource = sourceResults.find((result) => result.status === "rejected");
    if (rejectedSource?.status === "rejected") throw rejectedSource.reason;
    const postSource = sourceResults[0];
    const accountSource = sourceResults[1];
    if (postSource.status !== "fulfilled" || accountSource.status !== "fulfilled") throw new Error("同步來源未完整回傳");
    const { posts, apiCalls: postListCalls, complete: postListComplete } = postSource.value;
    const accountMetrics = accountSource.value;
    postsSeen = posts.length;
    apiCalls += postListCalls + 2;

    await mapWithConcurrency(posts, 4, controller, async (post) => {
      await upsertPost(connectionId, post);
      let metrics: PostMetrics;
      try {
        metrics = await getPostInsights(accessToken, post.id, controller.signal);
      } catch (error) {
        if (!(error instanceof ThreadsApiError) || ![400, 403].includes(error.status)) throw error;
        metrics = { views: null, likes: null, replies: null, reposts: null, quotes: null, shares: null };
      }
      apiCalls += 1;
      await upsertPostSnapshot(post.id, capturedOn, metrics);
    });
    if (postListComplete) await markMissingPostsUnavailable(connectionId, posts.map((post) => post.id));
    await upsertAccountSnapshot(connectionId, capturedOn, accountMetrics);
    await markConnectionSynced(connectionId, null);
    await finishSyncRun(runId, { status: "completed", postsSeen, apiCalls });
    return { connectionId, status: "completed", postsSeen, apiCalls };
  } catch (error) {
    const safe = publicError(error);
    if (connectionExists) await markConnectionSynced(connectionId, safe.message).catch(() => undefined);
    if (runStarted) await finishSyncRun(runId, { status: "failed", postsSeen, apiCalls, errorCode: safe.code, errorMessage: safe.message }).catch(() => undefined);
    return { connectionId, status: "failed", postsSeen, apiCalls, message: safe.message };
  } finally {
    clearTimeout(deadlineTimer);
    if (locked) await releaseSyncLock(connectionId, runId).catch(() => undefined);
  }
}

export async function syncAllConnections(deadlineAt = Date.now() + 270_000): Promise<{ results: SyncResult[]; truncated: boolean }> {
  const requestedLimit = Number(optionalEnv("SYNC_CONNECTION_LIMIT") ?? "5");
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 25) : 5;
  const connections = await listConnections(limit);
  const results: SyncResult[] = [];
  let truncated = false;
  for (const connection of connections) {
    if (Date.now() >= deadlineAt - 10_000) { truncated = true; break; }
    results.push(await syncConnection(connection.id, "cron", getSyncPostLimit(), deadlineAt));
  }
  if (Date.now() < deadlineAt - 5_000) await pruneOldData(Number(optionalEnv("DATA_RETENTION_DAYS") ?? "90"));
  else truncated = true;
  return { results, truncated };
}
