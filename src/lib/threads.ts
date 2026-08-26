import { getEnv } from "./env";
import type { AccountMetrics, PostMetrics, ThreadsPost, ThreadsProfile, ThreadsReply } from "./types";

const GRAPH_ORIGIN = "https://graph.threads.com";
const API_BASE = `${GRAPH_ORIGIN}/v1.0`;
const AUTH_URL = "https://threads.com/oauth/authorize";
export const THREADS_SCOPES = [
  "threads_basic",
  "threads_manage_insights",
  "threads_keyword_search",
  "threads_read_replies",
  "threads_manage_replies",
  "threads_content_publish",
] as const;

export const AUTO_REPLY_SCOPES = ["threads_read_replies", "threads_manage_replies", "threads_content_publish"] as const;

type ApiErrorBody = { error?: { message?: string; type?: string; code?: number; error_subcode?: number } };

export class ThreadsApiError extends Error {
  constructor(message: string, public status: number, public code?: number, public subcode?: number) {
    super(message);
    this.name = "ThreadsApiError";
  }
}

type Insight = {
  name?: string;
  values?: Array<{ value?: unknown; end_time?: string }>;
  total_value?: { value?: unknown };
  link_total_values?: Array<{ value?: unknown; link_url?: string }>;
};

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson<T>(url: string | URL, init: RequestInit = {}, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (init.signal?.aborted) throw init.signal.reason ?? new DOMException("Aborted", "AbortError");
    try {
      const timeoutSignal = AbortSignal.timeout(20_000);
      const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
      const response = await fetch(url, { ...init, cache: "no-store", signal });
      const body = await response.json().catch(() => ({})) as T & ApiErrorBody;
      if (response.ok) return body;
      const apiError = body.error;
      const error = new ThreadsApiError(apiError?.message ?? `Threads API 回傳 ${response.status}`, response.status, apiError?.code, apiError?.error_subcode);
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
    } catch (error) {
      if (init.signal?.aborted) throw init.signal.reason ?? error;
      if (error instanceof ThreadsApiError && error.status < 500 && error.status !== 429) throw error;
      lastError = error;
    }
    if (attempt < attempts - 1) await delay(400 * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new Error("Threads API 暫時無法使用");
}

function authenticatedUrl(path: string, query: Record<string, string | number | undefined> = {}): URL {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  return url;
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
}

export function buildAuthorizationUrl(redirectUri: string, state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", getEnv("THREADS_APP_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", THREADS_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{ accessToken: string; userId: string }> {
  const body = new URLSearchParams({
    client_id: getEnv("THREADS_APP_ID"), client_secret: getEnv("THREADS_APP_SECRET"),
    code: code.replace(/#_$/, ""), grant_type: "authorization_code", redirect_uri: redirectUri,
  });
  const result = await fetchJson<{ access_token?: string; user_id?: string | number }>(`${GRAPH_ORIGIN}/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  }, 1);
  if (!result.access_token || result.user_id === undefined) throw new Error("Threads OAuth 未回傳完整憑證");
  return { accessToken: result.access_token, userId: String(result.user_id) };
}

export async function exchangeForLongLivedToken(shortToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${GRAPH_ORIGIN}/access_token`);
  url.search = new URLSearchParams({ grant_type: "th_exchange_token", client_secret: getEnv("THREADS_APP_SECRET"), access_token: shortToken }).toString();
  const result = await fetchJson<{ access_token?: string; expires_in?: number }>(url, {}, 1);
  if (!result.access_token) throw new Error("無法取得 Threads 長效憑證");
  return { accessToken: result.access_token, expiresIn: Number(result.expires_in ?? 5_184_000) };
}

export async function refreshLongLivedToken(accessToken: string, signal?: AbortSignal): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${GRAPH_ORIGIN}/refresh_access_token`);
  url.search = new URLSearchParams({ grant_type: "th_refresh_token", access_token: accessToken }).toString();
  const result = await fetchJson<{ access_token?: string; expires_in?: number }>(url, { signal }, 1);
  if (!result.access_token) throw new Error("Threads 憑證更新失敗");
  return { accessToken: result.access_token, expiresIn: Number(result.expires_in ?? 5_184_000) };
}

export async function getGrantedScopes(userAccessToken: string): Promise<string[]> {
  const appTokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: getEnv("THREADS_APP_ID"),
    client_secret: getEnv("THREADS_APP_SECRET"),
  });
  const appToken = await fetchJson<{ access_token?: string }>(`${GRAPH_ORIGIN}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: appTokenBody,
  }, 1);
  if (!appToken.access_token) throw new Error("無法驗證 Threads 權限");
  const result = await fetchJson<{ data?: { is_valid?: boolean; scopes?: string[] } }>(
    authenticatedUrl("/debug_token", { input_token: userAccessToken }),
    { headers: authHeaders(appToken.access_token) },
    1,
  );
  if (result.data?.is_valid !== true || !Array.isArray(result.data.scopes)) throw new Error("Threads 權限驗證失敗");
  return result.data.scopes.filter((scope): scope is string => typeof scope === "string");
}

export async function getProfile(accessToken: string): Promise<ThreadsProfile> {
  return await fetchJson<ThreadsProfile>(authenticatedUrl("/me", { fields: "id,username,name,threads_profile_picture_url,threads_biography,is_verified" }), { headers: authHeaders(accessToken) });
}

function safeNextUrl(next: string | undefined): string | null {
  if (!next) return null;
  try {
    const url = new URL(next);
    return url.protocol === "https:" && ["graph.threads.com", "graph.threads.net"].includes(url.hostname) ? url.toString() : null;
  } catch { return null; }
}

export async function getOwnPosts(accessToken: string, maxPosts = 100, signal?: AbortSignal): Promise<{ posts: ThreadsPost[]; apiCalls: number; complete: boolean }> {
  const fields = "id,media_product_type,media_type,permalink,username,text,timestamp,shortcode,is_quote_post,has_replies";
  let next: string | null = authenticatedUrl("/me/threads", { fields, limit: Math.min(maxPosts, 100) }).toString();
  const posts: ThreadsPost[] = [];
  let apiCalls = 0;
  while (next && posts.length < maxPosts) {
    const page = await fetchJson<{ data?: ThreadsPost[]; paging?: { next?: string; cursors?: { after?: string } } }>(next, { headers: authHeaders(accessToken), signal });
    apiCalls += 1;
    posts.push(...(page.data ?? []).slice(0, maxPosts - posts.length).map(normalizePost));
    next = safeNextUrl(page.paging?.next);
  }
  return { posts, apiCalls, complete: next === null };
}

function normalizePost(post: ThreadsPost): ThreadsPost {
  let permalink: string | undefined;
  if (post.permalink) {
    try {
      const url = new URL(post.permalink);
      if (url.protocol === "https:" && ["threads.com", "www.threads.com", "threads.net", "www.threads.net"].includes(url.hostname)) permalink = url.toString();
    } catch { permalink = undefined; }
  }
  return { ...post, id: String(post.id), text: typeof post.text === "string" ? post.text : undefined, username: typeof post.username === "string" ? post.username : undefined, permalink };
}

function numeric(value: unknown): number | null {
  const result = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(result) ? result : null;
}

function insightValue(insight: Insight | undefined): number | null {
  if (!insight) return null;
  const total = numeric(insight.total_value?.value);
  if (total !== null) return total;
  const values = insight.values ?? [];
  return values.length ? numeric(values[values.length - 1]?.value) : null;
}

function insightMap(insights: Insight[] | undefined): Map<string, Insight> {
  return new Map((insights ?? []).filter((item) => item.name).map((item) => [item.name as string, item]));
}

async function requestPostInsights(accessToken: string, postId: string, metrics: string, signal?: AbortSignal): Promise<Insight[]> {
  const response = await fetchJson<{ data?: Insight[] }>(authenticatedUrl(`/${encodeURIComponent(postId)}/insights`, { metric: metrics }), { headers: authHeaders(accessToken), signal });
  return response.data ?? [];
}

export async function getPostInsights(accessToken: string, postId: string, signal?: AbortSignal): Promise<PostMetrics> {
  let insights: Insight[];
  try { insights = await requestPostInsights(accessToken, postId, "views,likes,replies,reposts,quotes,shares", signal); }
  catch (error) {
    if (!(error instanceof ThreadsApiError) || error.status !== 400) throw error;
    insights = await requestPostInsights(accessToken, postId, "views,likes,replies,reposts,quotes", signal);
  }
  const map = insightMap(insights);
  return { views: insightValue(map.get("views")), likes: insightValue(map.get("likes")), replies: insightValue(map.get("replies")), reposts: insightValue(map.get("reposts")), quotes: insightValue(map.get("quotes")), shares: insightValue(map.get("shares")) };
}

export async function getAccountInsights(accessToken: string, signal?: AbortSignal): Promise<AccountMetrics> {
  const now = Math.floor(Date.now() / 1000);
  const since = now - 2 * 24 * 60 * 60;
  const [datedResult, followerResult] = await Promise.allSettled([
    fetchJson<{ data?: Insight[] }>(authenticatedUrl("/me/threads_insights", { metric: "views,likes,replies,reposts,quotes,clicks", since, until: now }), { headers: authHeaders(accessToken), signal }),
    fetchJson<{ data?: Insight[] }>(authenticatedUrl("/me/threads_insights", { metric: "followers_count" }), { headers: authHeaders(accessToken), signal }),
  ]);
  if (datedResult.status === "rejected") throw datedResult.reason;
  if (followerResult.status === "rejected") throw followerResult.reason;
  const datedResponse = datedResult.value;
  const followerResponse = followerResult.value;
  const map = insightMap([...(datedResponse.data ?? []), ...(followerResponse.data ?? [])]);
  const clicks = map.get("clicks");
  const clickTotal = clicks?.link_total_values?.length
    ? clicks.link_total_values.map((item) => numeric(item.value)).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
    : insightValue(clicks);
  return { views: insightValue(map.get("views")), likes: insightValue(map.get("likes")), replies: insightValue(map.get("replies")), reposts: insightValue(map.get("reposts")), quotes: insightValue(map.get("quotes")), clicks: clickTotal, followersCount: insightValue(map.get("followers_count")) };
}

export type SearchType = "TOP" | "RECENT";
export type SearchMode = "KEYWORD" | "TAG";

export async function searchPublicPosts(accessToken: string, args: { query: string; type: SearchType; mode: SearchMode }): Promise<ThreadsPost[]> {
  const fields = "id,media_product_type,media_type,permalink,username,text,timestamp,shortcode,is_quote_post,has_replies";
  const result = await fetchJson<{ data?: ThreadsPost[] }>(authenticatedUrl("/keyword_search", {
    q: args.query, search_type: args.type, search_mode: args.mode, fields, limit: 25,
  }), { headers: authHeaders(accessToken) });
  return (result.data ?? []).map(normalizePost);
}

export async function getPostReplies(accessToken: string, postId: string, maxReplies = 100, signal?: AbortSignal): Promise<{ replies: ThreadsReply[]; apiCalls: number }> {
  const fields = "id,text,username,permalink,timestamp,media_type,has_replies,root_post,replied_to,is_reply,is_reply_owned_by_me,hide_status";
  const replies: ThreadsReply[] = [];
  let after: string | undefined;
  let apiCalls = 0;
  while (replies.length < maxReplies) {
    const url = authenticatedUrl(`/${encodeURIComponent(postId)}/replies`, {
      fields,
      reverse: "true",
      limit: Math.min(50, maxReplies - replies.length),
      after,
    });
    const page = await fetchJson<{ data?: ThreadsReply[]; paging?: { cursors?: { after?: string } } }>(url, {
      headers: authHeaders(accessToken), signal,
    });
    apiCalls += 1;
    replies.push(...(page.data ?? []).map((reply) => ({
      ...reply,
      id: String(reply.id),
      text: typeof reply.text === "string" ? reply.text : undefined,
      username: typeof reply.username === "string" ? reply.username : undefined,
    })));
    const nextAfter = page.paging?.cursors?.after;
    if (!nextAfter || nextAfter === after || !(page.data?.length)) break;
    after = nextAfter;
  }
  return { replies: replies.slice(0, maxReplies), apiCalls };
}

export async function createReplyContainer(accessToken: string, replyToId: string, text: string, signal?: AbortSignal): Promise<string> {
  const body = new URLSearchParams({ media_type: "TEXT", text, reply_to_id: replyToId });
  const result = await fetchJson<{ id?: string }>(authenticatedUrl("/me/threads"), {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal,
  }, 1);
  if (!result.id) throw new ThreadsApiError("Threads 未回傳回覆容器", 502);
  return String(result.id);
}

export async function getContainerStatus(accessToken: string, containerId: string, signal?: AbortSignal): Promise<{ status: string; errorMessage?: string }> {
  const result = await fetchJson<{ status?: string; error_message?: string }>(
    authenticatedUrl(`/${encodeURIComponent(containerId)}`, { fields: "id,status,error_message" }),
    { headers: authHeaders(accessToken), signal },
    1,
  );
  return { status: String(result.status ?? "UNKNOWN").toUpperCase(), errorMessage: result.error_message };
}

export async function publishReplyContainer(accessToken: string, threadsUserId: string, containerId: string, signal?: AbortSignal): Promise<string> {
  const body = new URLSearchParams({ creation_id: containerId });
  const result = await fetchJson<{ id?: string }>(authenticatedUrl(`/${encodeURIComponent(threadsUserId)}/threads_publish`), {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal,
  }, 1);
  if (!result.id) throw new ThreadsApiError("Threads 未回傳已發布回覆", 502);
  return String(result.id);
}
