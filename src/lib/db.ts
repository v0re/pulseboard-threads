import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getEnv, optionalEnv } from "./env";
import type { AccountMetrics, PostMetrics, ThreadsPost, ThreadsProfile } from "./types";

type Sql = NeonQueryFunction<false, false>;
let sqlClient: Sql | null = null;

export function hasDatabase(): boolean {
  return Boolean(optionalEnv("DATABASE_URL"));
}

export function db(): Sql {
  if (!sqlClient) sqlClient = neon(getEnv("DATABASE_URL"));
  return sqlClient;
}

export type ConnectionRow = {
  id: string;
  threads_user_id: string;
  username: string;
  display_name: string | null;
  profile_picture_url: string | null;
  biography: string | null;
  access_token_encrypted: string;
  token_expires_at: string | Date;
  token_refreshed_at: string | Date;
  token_version: number | string;
  session_version: string;
  granted_scopes: string[];
  last_synced_at: string | Date | null;
  last_sync_error: string | null;
};

export async function upsertConnection(args: {
  id: string;
  profile: ThreadsProfile;
  encryptedToken: string;
  tokenExpiresAt: Date;
  scopes: string[];
  sessionVersion: string;
}): Promise<string> {
  const rows = await db().query(
    `INSERT INTO threads_connections
      (id, threads_user_id, username, display_name, profile_picture_url, biography, access_token_encrypted, token_expires_at, token_refreshed_at, granted_scopes, session_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9::text[],$10)
     ON CONFLICT (threads_user_id) DO UPDATE SET
       username=EXCLUDED.username, display_name=EXCLUDED.display_name,
       profile_picture_url=EXCLUDED.profile_picture_url, biography=EXCLUDED.biography,
       access_token_encrypted=EXCLUDED.access_token_encrypted, token_expires_at=EXCLUDED.token_expires_at,
       token_refreshed_at=now(), token_version=threads_connections.token_version+1, granted_scopes=EXCLUDED.granted_scopes,
       session_version=EXCLUDED.session_version,
       last_sync_error=NULL, updated_at=now()
     RETURNING id`,
    [args.id, args.profile.id, args.profile.username, args.profile.name ?? null, args.profile.threads_profile_picture_url ?? null,
      args.profile.threads_biography ?? null, args.encryptedToken, args.tokenExpiresAt.toISOString(), args.scopes, args.sessionVersion],
  ) as Array<{ id: string }>;
  return rows[0].id;
}

export async function getConnection(connectionId: string): Promise<ConnectionRow | null> {
  const rows = await db().query(`SELECT * FROM threads_connections WHERE id=$1 LIMIT 1`, [connectionId]) as ConnectionRow[];
  return rows[0] ?? null;
}

export async function listConnections(limit = 25): Promise<ConnectionRow[]> {
  return await db().query(
    `SELECT c.* FROM threads_connections c
     LEFT JOIN LATERAL (
       SELECT MAX(started_at) AS last_attempt_at FROM sync_runs r WHERE r.connection_id=c.id
     ) attempt ON true
     ORDER BY COALESCE(attempt.last_attempt_at,c.connected_at) ASC LIMIT $1`,
    [limit],
  ) as ConnectionRow[];
}

export async function updateConnectionToken(connectionId: string, expectedVersion: number, encryptedToken: string, expiresAt: Date): Promise<boolean> {
  const rows = await db().query(
    `UPDATE threads_connections SET access_token_encrypted=$3, token_expires_at=$4, token_refreshed_at=now(),
       token_version=token_version+1, updated_at=now()
     WHERE id=$1 AND token_version=$2 RETURNING id`,
    [connectionId, expectedVersion, encryptedToken, expiresAt.toISOString()],
  ) as Array<{ id: string }>;
  return rows.length === 1;
}

export async function markConnectionSynced(connectionId: string, error: string | null): Promise<void> {
  await db().query(`UPDATE threads_connections SET last_synced_at=CASE WHEN $2::text IS NULL THEN now() ELSE last_synced_at END, last_sync_error=$2, updated_at=now() WHERE id=$1`, [connectionId, error]);
}

export async function upsertPost(connectionId: string, post: ThreadsPost): Promise<void> {
  await db().query(
    `INSERT INTO threads_posts
      (id, connection_id, media_product_type, media_type, permalink, username, body_text, published_at, shortcode, is_quote_post, has_replies, last_seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
     ON CONFLICT (id) DO UPDATE SET media_product_type=EXCLUDED.media_product_type, media_type=EXCLUDED.media_type,
       permalink=EXCLUDED.permalink, username=EXCLUDED.username, body_text=EXCLUDED.body_text,
       published_at=EXCLUDED.published_at, shortcode=EXCLUDED.shortcode, is_quote_post=EXCLUDED.is_quote_post,
       has_replies=EXCLUDED.has_replies, last_seen_at=now(), unavailable_at=NULL`,
    [post.id, connectionId, post.media_product_type ?? null, post.media_type ?? null, post.permalink ?? null, post.username ?? null,
      post.text ?? null, post.timestamp ?? null, post.shortcode ?? null, Boolean(post.is_quote_post), Boolean(post.has_replies)],
  );
}

export async function markMissingPostsUnavailable(connectionId: string, seenPostIds: string[]): Promise<void> {
  await db().query(
    `UPDATE threads_posts SET unavailable_at=now()
     WHERE connection_id=$1 AND unavailable_at IS NULL AND NOT (id=ANY($2::text[]))`,
    [connectionId, seenPostIds],
  );
}

export async function upsertPostSnapshot(postId: string, capturedOn: string, metrics: PostMetrics): Promise<void> {
  await db().query(
    `INSERT INTO post_metric_snapshots (post_id,captured_on,captured_at,views,likes,replies,reposts,quotes,shares)
     VALUES ($1,$2,now(),$3,$4,$5,$6,$7,$8)
     ON CONFLICT (post_id,captured_on) DO UPDATE SET captured_at=now(), views=EXCLUDED.views, likes=EXCLUDED.likes,
       replies=EXCLUDED.replies, reposts=EXCLUDED.reposts, quotes=EXCLUDED.quotes, shares=EXCLUDED.shares`,
    [postId, capturedOn, metrics.views, metrics.likes, metrics.replies, metrics.reposts, metrics.quotes, metrics.shares],
  );
}

export async function upsertAccountSnapshot(connectionId: string, capturedOn: string, metrics: AccountMetrics): Promise<void> {
  await db().query(
    `INSERT INTO account_metric_snapshots (connection_id,captured_on,captured_at,views,likes,replies,reposts,quotes,clicks,followers_count)
     VALUES ($1,$2,now(),$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (connection_id,captured_on) DO UPDATE SET captured_at=now(), views=EXCLUDED.views, likes=EXCLUDED.likes,
       replies=EXCLUDED.replies, reposts=EXCLUDED.reposts, quotes=EXCLUDED.quotes, clicks=EXCLUDED.clicks,
       followers_count=EXCLUDED.followers_count`,
    [connectionId, capturedOn, metrics.views, metrics.likes, metrics.replies, metrics.reposts, metrics.quotes, metrics.clicks, metrics.followersCount],
  );
}

export async function startSyncRun(id: string, connectionId: string, source: "oauth" | "manual" | "cron"): Promise<void> {
  await db().query(`INSERT INTO sync_runs (id,connection_id,source,status) VALUES ($1,$2,$3,'running')`, [id, connectionId, source]);
}

export async function finishSyncRun(id: string, args: { status: "completed" | "failed" | "skipped"; postsSeen?: number; apiCalls?: number; errorCode?: string; errorMessage?: string }): Promise<void> {
  await db().query(`UPDATE sync_runs SET status=$2, posts_seen=$3, api_calls=$4, error_code=$5, error_message=$6, finished_at=now() WHERE id=$1`,
    [id, args.status, args.postsSeen ?? 0, args.apiCalls ?? 0, args.errorCode ?? null, args.errorMessage?.slice(0, 500) ?? null]);
}

export async function acquireSyncLock(connectionId: string, ownerId: string, seconds = 360): Promise<boolean> {
  const rows = await db().query(
    `INSERT INTO sync_locks (connection_id,owner_id,expires_at) VALUES ($1,$2,now()+($3 || ' seconds')::interval)
     ON CONFLICT (connection_id) DO UPDATE SET owner_id=EXCLUDED.owner_id, expires_at=EXCLUDED.expires_at
     WHERE sync_locks.expires_at < now()
     RETURNING owner_id`, [connectionId, ownerId, seconds],
  ) as Array<{ owner_id: string }>;
  return rows[0]?.owner_id === ownerId;
}

export async function releaseSyncLock(connectionId: string, ownerId: string): Promise<void> {
  await db().query(`DELETE FROM sync_locks WHERE connection_id=$1 AND owner_id=$2`, [connectionId, ownerId]);
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await db().query(`DELETE FROM threads_connections WHERE id=$1`, [connectionId]);
}

export async function recordAudit(connectionId: string | null, eventType: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await db().query(`INSERT INTO audit_events (id,connection_id,event_type,metadata) VALUES ($1,$2,$3,$4::jsonb)`,
    [crypto.randomUUID(), connectionId, eventType, JSON.stringify(metadata)]);
}

export async function countRecentAudit(connectionId: string, eventType: string, seconds: number): Promise<number> {
  const rows = await db().query(
    `SELECT COUNT(*)::integer AS count FROM audit_events WHERE connection_id=$1 AND event_type=$2 AND created_at > now()-($3 || ' seconds')::interval`,
    [connectionId, eventType, seconds],
  ) as Array<{ count: number | string }>;
  return Number(rows[0]?.count ?? 0);
}

export async function consumeSearchQuota(connectionId: string): Promise<boolean> {
  const rows = await db().query(
    `WITH daily AS (
       INSERT INTO search_rate_limits (connection_id,bucket_type,bucket_start,request_count)
       VALUES ($1,'day',date_trunc('day',now()),1)
       ON CONFLICT (connection_id,bucket_type,bucket_start) DO UPDATE
         SET request_count=search_rate_limits.request_count+1
         WHERE search_rate_limits.request_count < 2000
       RETURNING request_count
     ), minute AS (
       INSERT INTO search_rate_limits (connection_id,bucket_type,bucket_start,request_count)
       SELECT $1,'minute',date_trunc('minute',now()),1 FROM daily
       ON CONFLICT (connection_id,bucket_type,bucket_start) DO UPDATE
         SET request_count=search_rate_limits.request_count+1
         WHERE search_rate_limits.request_count < 10
       RETURNING request_count
     )
     SELECT EXISTS(SELECT 1 FROM minute) AS allowed`,
    [connectionId],
  ) as Array<{ allowed: boolean }>;
  return rows[0]?.allowed === true;
}

export async function pruneOldData(days: number): Promise<void> {
  const safeDays = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days), 30), 3650) : 90;
  await db().query(`DELETE FROM post_metric_snapshots WHERE captured_on < current_date-$1::integer`, [safeDays]);
  await db().query(`DELETE FROM account_metric_snapshots WHERE captured_on < current_date-$1::integer`, [safeDays]);
  await db().query(`DELETE FROM sync_runs WHERE started_at < now()-($1 || ' days')::interval`, [safeDays]);
  await db().query(`DELETE FROM audit_events WHERE created_at < now()-($1 || ' days')::interval`, [safeDays]);
  const automationTables = await db().query(
    `SELECT to_regclass('public.auto_reply_jobs') IS NOT NULL AS jobs,
      to_regclass('public.auto_reply_daily_usage') IS NOT NULL AS usage`,
  ) as Array<{ jobs: boolean; usage: boolean }>;
  if (automationTables[0]?.jobs) {
    await db().query(`DELETE FROM auto_reply_jobs WHERE created_at < now()-($1 || ' days')::interval AND status NOT IN ('publishing')`, [safeDays]);
  }
  if (automationTables[0]?.usage) {
    await db().query(`DELETE FROM auto_reply_daily_usage WHERE local_date < (now() AT TIME ZONE 'Asia/Taipei')::date-2`);
  }
  await db().query(`DELETE FROM search_rate_limits WHERE bucket_start < now()-interval '2 days'`);
}
