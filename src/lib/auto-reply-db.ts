import "server-only";

import { db } from "./db";

export const AUTO_REPLY_LIMIT_OPTIONS = [3, 5, 10] as const;

export type AutoReplySettings = {
  enabled: boolean;
  enabledAt: string | null;
  dailyLimit: number;
};

export type AutoReplyLog = {
  id: string;
  sourceUsername: string | null;
  status: string;
  category: string | null;
  skipReason: string | null;
  generatedReply: string | null;
  createdAt: string;
  publishedAt: string | null;
};

export type AutoReplyJob = {
  id: string;
  status: string;
  generated_reply: string | null;
};

export type PublishingJob = { id: string; containerId: string | null };

type SettingsRow = {
  enabled: boolean;
  enabled_at: string | Date | null;
  daily_limit: number | string;
};

function settingsFromRow(row?: SettingsRow): AutoReplySettings {
  return {
    enabled: row?.enabled === true,
    enabledAt: row?.enabled_at ? new Date(row.enabled_at).toISOString() : null,
    dailyLimit: Number(row?.daily_limit ?? 5),
  };
}

export async function getAutoReplySettings(connectionId: string): Promise<AutoReplySettings> {
  const rows = await db().query(
    `SELECT enabled,enabled_at,daily_limit FROM auto_reply_settings WHERE connection_id=$1 LIMIT 1`,
    [connectionId],
  ) as SettingsRow[];
  return settingsFromRow(rows[0]);
}

export async function saveAutoReplySettings(connectionId: string, enabled: boolean, dailyLimit: number): Promise<AutoReplySettings> {
  if (!AUTO_REPLY_LIMIT_OPTIONS.includes(dailyLimit as (typeof AUTO_REPLY_LIMIT_OPTIONS)[number])) throw new Error("每日上限無效");
  const rows = await db().query(
    `WITH saved AS (
       INSERT INTO auto_reply_settings (connection_id,enabled,enabled_at,daily_limit,updated_at)
       VALUES ($1,$2,CASE WHEN $2 THEN now() ELSE NULL END,$3,now())
       ON CONFLICT (connection_id) DO UPDATE SET
         enabled=EXCLUDED.enabled,
         enabled_at=CASE
           WHEN EXCLUDED.enabled AND NOT auto_reply_settings.enabled THEN now()
           WHEN EXCLUDED.enabled THEN auto_reply_settings.enabled_at
           ELSE auto_reply_settings.enabled_at
         END,
         daily_limit=EXCLUDED.daily_limit,
         updated_at=now()
       RETURNING enabled,enabled_at,daily_limit
     ), cancelled AS (
       UPDATE auto_reply_jobs SET status='skipped',category='settings',skip_reason='disabled',updated_at=now()
       WHERE connection_id=$1 AND NOT $2 AND status IN ('discovered','generating','ready')
       RETURNING id
     )
     SELECT enabled,enabled_at,daily_limit FROM saved`,
    [connectionId, enabled, dailyLimit],
  ) as SettingsRow[];
  return settingsFromRow(rows[0]);
}

export async function getAutoReplyLogs(connectionId: string, limit = 20): Promise<AutoReplyLog[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const rows = await db().query(
    `SELECT id,source_username,status,category,skip_reason,generated_reply,created_at,published_at
     FROM auto_reply_jobs WHERE connection_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [connectionId, safeLimit],
  ) as Array<{
    id: string; source_username: string | null; status: string; category: string | null;
    skip_reason: string | null; generated_reply: string | null; created_at: string | Date; published_at: string | Date | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    sourceUsername: row.source_username,
    status: row.status,
    category: row.category,
    skipReason: row.skip_reason,
    generatedReply: row.generated_reply,
    createdAt: new Date(row.created_at).toISOString(),
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
  }));
}

export async function getAutoReplyUsageToday(connectionId: string): Promise<number> {
  const rows = await db().query(
    `SELECT reserved_count AS count FROM auto_reply_daily_usage
     WHERE connection_id=$1 AND local_date=(now() AT TIME ZONE 'Asia/Taipei')::date`,
    [connectionId],
  ) as Array<{ count: number | string }>;
  return Number(rows[0]?.count ?? 0);
}

export async function listPostsForReplyScan(connectionId: string, limit: number): Promise<Array<{ id: string; text: string }>> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  return await db().query(
    `SELECT id,COALESCE(body_text,'') AS text FROM threads_posts
     WHERE connection_id=$1 AND unavailable_at IS NULL AND has_replies=true
     ORDER BY replies_scanned_at ASC NULLS FIRST,published_at DESC NULLS LAST LIMIT $2`,
    [connectionId, safeLimit],
  ) as Array<{ id: string; text: string }>;
}

export async function markRepliesScanned(connectionId: string, postId: string): Promise<void> {
  await db().query(`UPDATE threads_posts SET replies_scanned_at=now() WHERE connection_id=$1 AND id=$2`, [connectionId, postId]);
}

export async function claimAutoReplyJob(args: {
  id: string;
  connectionId: string;
  rootPostId: string;
  sourceReplyId: string;
  sourceUsername: string | null;
  sourceCreatedAt: string;
}): Promise<AutoReplyJob | null> {
  const rows = await db().query(
    `WITH receipt AS (
       INSERT INTO auto_reply_receipts (connection_id,source_reply_id)
       VALUES ($2,$4) ON CONFLICT DO NOTHING RETURNING connection_id
     ), inserted AS (
       INSERT INTO auto_reply_jobs
         (id,connection_id,root_post_id,source_reply_id,source_username,source_created_at,status)
       SELECT $1,$2,$3,$4,$5,$6,'discovered' FROM receipt
       RETURNING id,status,generated_reply
     ), reclaimed AS (
       UPDATE auto_reply_jobs SET updated_at=now()
       WHERE connection_id=$2 AND source_reply_id=$4 AND NOT EXISTS (SELECT 1 FROM inserted)
         AND status IN ('discovered','generating','ready')
         AND (status='ready' OR updated_at < now()-interval '30 minutes')
       RETURNING id,status,generated_reply
     )
     SELECT * FROM inserted UNION ALL SELECT * FROM reclaimed`,
    [args.id, args.connectionId, args.rootPostId, args.sourceReplyId, args.sourceUsername, args.sourceCreatedAt],
  ) as AutoReplyJob[];
  return rows[0] ?? null;
}

export async function markAutoReplyGenerating(id: string): Promise<boolean> {
  const rows = await db().query(
    `UPDATE auto_reply_jobs SET status='generating',updated_at=now() WHERE id=$1 AND status IN ('discovered','generating') RETURNING id`,
    [id],
  ) as Array<{ id: string }>;
  return rows.length === 1;
}

export async function markAutoReplySkipped(id: string, category: string, reason: string): Promise<void> {
  await db().query(
    `UPDATE auto_reply_jobs SET status='skipped',category=$2,skip_reason=$3,updated_at=now()
     WHERE id=$1 AND status NOT IN ('publishing','published','uncertain')`,
    [id, category.slice(0, 80), reason.slice(0, 240)],
  );
}

export async function markAutoReplyFailed(id: string, errorCode: string): Promise<void> {
  await db().query(
    `UPDATE auto_reply_jobs SET status='failed',error_code=$2,updated_at=now()
     WHERE id=$1 AND status NOT IN ('publishing','published','uncertain')`,
    [id, errorCode.slice(0, 80)],
  );
}

export async function markAutoReplyReady(id: string, args: { reply: string; category: string; responseId: string | null; model: string }): Promise<void> {
  await db().query(
    `UPDATE auto_reply_jobs SET status='ready',generated_reply=$2,category=$3,openai_response_id=$4,model=$5,updated_at=now()
     WHERE id=$1 AND status='generating'`,
    [id, args.reply, args.category.slice(0, 80), args.responseId, args.model.slice(0, 120)],
  );
}

export async function claimAutoReplyForPublishing(connectionId: string, id: string): Promise<string | null> {
  const rows = await db().query(
    `WITH config AS (
       SELECT daily_limit FROM auto_reply_settings WHERE connection_id=$1 AND enabled=true
     ), candidate AS MATERIALIZED (
       SELECT id FROM auto_reply_jobs WHERE id=$2 AND connection_id=$1 AND status='ready' FOR UPDATE
     ), reservation AS (
       INSERT INTO auto_reply_daily_usage (connection_id,local_date,reserved_count)
       SELECT $1,(now() AT TIME ZONE 'Asia/Taipei')::date,1 FROM config,candidate
       ON CONFLICT (connection_id,local_date) DO UPDATE
         SET reserved_count=auto_reply_daily_usage.reserved_count+1
         WHERE auto_reply_daily_usage.reserved_count < (SELECT daily_limit FROM config)
       RETURNING reserved_count
     )
     UPDATE auto_reply_jobs j SET status='publishing',attempt_count=attempt_count+1,
       quota_local_date=(now() AT TIME ZONE 'Asia/Taipei')::date,publish_attempted_at=now(),updated_at=now()
     FROM reservation
     WHERE j.id=$2 AND j.connection_id=$1 AND j.status='ready'
     RETURNING j.generated_reply`,
    [connectionId, id],
  ) as Array<{ generated_reply: string | null }>;
  return rows[0]?.generated_reply ?? null;
}

export async function ensureAutoReplyPublishQuota(connectionId: string, id: string): Promise<boolean> {
  const rows = await db().query(
    `WITH config AS (
       SELECT daily_limit FROM auto_reply_settings WHERE connection_id=$1 AND enabled=true
     ), candidate AS MATERIALIZED (
       SELECT id,quota_local_date FROM auto_reply_jobs
       WHERE id=$2 AND connection_id=$1 AND status IN ('publishing','uncertain') FOR UPDATE
     ), already_reserved AS (
       SELECT id FROM candidate,config
       WHERE quota_local_date=(now() AT TIME ZONE 'Asia/Taipei')::date
     ), reservation AS (
       INSERT INTO auto_reply_daily_usage (connection_id,local_date,reserved_count)
       SELECT $1,(now() AT TIME ZONE 'Asia/Taipei')::date,1 FROM candidate,config
       WHERE quota_local_date IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Taipei')::date
       ON CONFLICT (connection_id,local_date) DO UPDATE
         SET reserved_count=auto_reply_daily_usage.reserved_count+1
         WHERE auto_reply_daily_usage.reserved_count < (SELECT daily_limit FROM config)
       RETURNING reserved_count
     ), moved AS (
       UPDATE auto_reply_jobs SET quota_local_date=(now() AT TIME ZONE 'Asia/Taipei')::date,updated_at=now()
       WHERE id=$2 AND EXISTS (SELECT 1 FROM reservation) RETURNING id
     )
     SELECT EXISTS(SELECT 1 FROM already_reserved) OR EXISTS(SELECT 1 FROM moved) AS allowed`,
    [connectionId, id],
  ) as Array<{ allowed: boolean }>;
  return rows[0]?.allowed === true;
}

export async function recordAutoReplyContainer(id: string, containerId: string): Promise<void> {
  await db().query(
    `UPDATE auto_reply_jobs SET container_id=$2,updated_at=now() WHERE id=$1 AND status='publishing'`,
    [id, containerId],
  );
}

export async function claimStalePublishingJobs(connectionId: string, limit = 5): Promise<PublishingJob[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
  const rows = await db().query(
    `WITH stale AS (
       SELECT id FROM auto_reply_jobs
       WHERE connection_id=$1 AND status IN ('publishing','uncertain') AND updated_at < now()-interval '30 minutes'
       ORDER BY publish_attempted_at ASC NULLS FIRST LIMIT $2 FOR UPDATE SKIP LOCKED
     )
     UPDATE auto_reply_jobs j SET updated_at=now() FROM stale WHERE j.id=stale.id
     RETURNING j.id,j.container_id`,
    [connectionId, safeLimit],
  ) as Array<{ id: string; container_id: string | null }>;
  return rows.map((row) => ({ id: row.id, containerId: row.container_id }));
}

export async function isAutoReplyEnabled(connectionId: string): Promise<boolean> {
  const rows = await db().query(
    `SELECT enabled FROM auto_reply_settings WHERE connection_id=$1 LIMIT 1`,
    [connectionId],
  ) as Array<{ enabled: boolean }>;
  return rows[0]?.enabled === true;
}

export async function markAutoReplyPublished(id: string, responseId: string): Promise<void> {
  await db().query(
    `UPDATE auto_reply_jobs SET status='published',threads_response_id=$2,published_at=now(),updated_at=now()
     WHERE id=$1 AND status IN ('publishing','uncertain')`,
    [id, responseId],
  );
}

export async function markAutoReplyPublishOutcome(id: string, status: "failed" | "uncertain", errorCode: string): Promise<void> {
  await db().query(
    `UPDATE auto_reply_jobs SET status=$2,error_code=$3,updated_at=now() WHERE id=$1 AND status IN ('publishing','uncertain')`,
    [id, status, errorCode.slice(0, 80)],
  );
}
