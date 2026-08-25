import "server-only";

import { engagementRate, interactionTotal, percentChange, sumKnown } from "./analytics";
import { db, getConnection, hasDatabase } from "./db";
import { getSyncPostLimit, isAppConfigured } from "./env";
import { getSessionConnectionId } from "./session";
import type { MetricValue, PostMetrics, PostViewModel } from "./types";

type MetricCard = { label: string; value: MetricValue; suffix?: string; change: number | null; detail: string };

export type DashboardModel = {
  connected: boolean;
  demo: boolean;
  username: string;
  displayName: string;
  lastSyncedAt: string | null;
  syncError: string | null;
  cards: MetricCard[];
  trend: Array<{ label: string; value: number | null }>;
  topPosts: PostViewModel[];
  insight: { title: string; detail: string };
  dataScope: { syncedPosts: number; withViewData: number; syncLimit: number };
  accountTraffic: { profileViews: MetricValue; clicks: MetricValue };
};

type PostRow = {
  id: string;
  body_text: string | null;
  media_type: string | null;
  permalink: string | null;
  published_at: string | Date | null;
  views: string | number | null;
  likes: string | number | null;
  replies: string | number | null;
  reposts: string | number | null;
  quotes: string | number | null;
  shares: string | number | null;
};

type AccountSnapshotRow = {
  captured_on: string | Date;
  captured_at?: string | Date;
  views: string | number | null;
  likes?: string | number | null;
  replies?: string | number | null;
  reposts?: string | number | null;
  quotes?: string | number | null;
  clicks: string | number | null;
  followers_count: string | number | null;
};

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function metricsFromRow(row: PostRow): PostMetrics {
  return {
    views: numberOrNull(row.views),
    likes: numberOrNull(row.likes),
    replies: numberOrNull(row.replies),
    reposts: numberOrNull(row.reposts),
    quotes: numberOrNull(row.quotes),
    shares: numberOrNull(row.shares),
  };
}

function postFromRow(row: PostRow): PostViewModel {
  const metrics = metricsFromRow(row);
  return {
    id: row.id,
    text: row.body_text ?? "（無文字內容）",
    mediaType: row.media_type ?? "UNKNOWN",
    permalink: row.permalink ?? "https://www.threads.com/",
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : "",
    metrics,
    engagementRate: engagementRate(metrics),
  };
}

function taipeiHour(value: string): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const hourPart = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart);
  return Number.isInteger(hour) ? hour : null;
}

function hasCompleteInteractionData(metrics: PostMetrics): boolean {
  return [metrics.likes, metrics.replies, metrics.reposts, metrics.quotes].every((value) => value !== null);
}

function iso(value: string | Date): string {
  return new Date(value).toISOString();
}

export const demoDashboard: DashboardModel = {
  connected: false,
  demo: true,
  username: "demo",
  displayName: "展示帳號",
  lastSyncedAt: new Date().toISOString(),
  syncError: null,
  cards: [
    { label: "已同步貼文累計瀏覽", value: 48260, change: 18.4, detail: "3/3 則有資料；非獨立訪客" },
    { label: "內容互動", value: 3912, change: 9.2, detail: "讚、回覆、轉發、引用" },
    { label: "互動率", value: 8.1, suffix: "%", change: 0.7, detail: "以 3 則指標完整的貼文計算" },
    { label: "追蹤者", value: 2684, change: 4.8, detail: "目前追蹤人數" },
  ],
  trend: [38, 45, 34, 59, 52, 68, 61, 76, 71, 88, 79, 96, 90, 100].map((value, index) => ({ label: String(index + 12), value })),
  topPosts: [
    { id: "demo-1", mediaType: "TEXT_POST", publishedAt: new Date().toISOString(), text: "如果只能保留一個內容指標，我會選擇能說明『為什麼』的那一個。", permalink: "https://www.threads.com/", metrics: { views: 12840, likes: 760, replies: 126, reposts: 94, quotes: 37, shares: 22 }, engagementRate: 7.92 },
    { id: "demo-2", mediaType: "IMAGE", publishedAt: new Date(Date.now() - 86400000).toISOString(), text: "這週的產品迭代筆記：三個小改動，讓整體體驗更安靜也更快。", permalink: "https://www.threads.com/", metrics: { views: 8421, likes: 391, replies: 63, reposts: 45, quotes: 21, shares: 18 }, engagementRate: 6.17 },
    { id: "demo-3", mediaType: "VIDEO", publishedAt: new Date(Date.now() - 172800000).toISOString(), text: "60 秒看完：如何把一份混亂的數據，整理成真正能採取行動的洞察。", permalink: "https://www.threads.com/", metrics: { views: 6930, likes: 298, replies: 54, reposts: 39, quotes: 18, shares: 12 }, engagementRate: 5.9 },
  ],
  insight: { title: "初步觀察：台北時間 09:00 發布的貼文，目前平均瀏覽最高。", detail: "展示洞察；真實結果會標示樣本限制，不代表發布時段造成瀏覽差異。" },
  dataScope: { syncedPosts: 3, withViewData: 3, syncLimit: 100 },
  accountTraffic: { profileViews: 4380, clicks: 276 },
};

async function loadPostRows(connectionId: string): Promise<PostRow[]> {
  return await db().query(
    `SELECT p.id,p.body_text,p.media_type,p.permalink,p.published_at,
      s.views,s.likes,s.replies,s.reposts,s.quotes,s.shares
     FROM threads_posts p
     LEFT JOIN LATERAL (
       SELECT * FROM post_metric_snapshots x WHERE x.post_id=p.id ORDER BY captured_on DESC LIMIT 1
     ) s ON true
     WHERE p.connection_id=$1 AND p.unavailable_at IS NULL
     ORDER BY p.published_at DESC NULLS LAST LIMIT 250`,
    [connectionId],
  ) as PostRow[];
}

export async function getAllPostsForSession(): Promise<PostViewModel[]> {
  if (!isAppConfigured() || !hasDatabase()) return demoDashboard.topPosts;
  const connectionId = await getSessionConnectionId();
  if (!connectionId) return demoDashboard.topPosts;
  return (await loadPostRows(connectionId)).map(postFromRow);
}

export async function getDashboard(): Promise<DashboardModel> {
  if (!isAppConfigured() || !hasDatabase()) return demoDashboard;
  const connectionId = await getSessionConnectionId();
  if (!connectionId) return demoDashboard;
  const connection = await getConnection(connectionId);
  if (!connection) return demoDashboard;

  const [postRows, historyRows, accountRows] = await Promise.all([
    loadPostRows(connectionId),
    db().query(
      `SELECT s.captured_on, SUM(s.views)::bigint AS views
       FROM post_metric_snapshots s JOIN threads_posts p ON p.id=s.post_id
       WHERE p.connection_id=$1 AND p.unavailable_at IS NULL AND s.captured_on >= current_date - 30
       GROUP BY s.captured_on ORDER BY s.captured_on`,
      [connectionId],
    ) as unknown as Promise<Array<{ captured_on: string | Date; views: string | number | null }>>,
    db().query(
      `SELECT captured_on,views,clicks,followers_count
       FROM account_metric_snapshots WHERE connection_id=$1 ORDER BY captured_on DESC LIMIT 2`,
      [connectionId],
    ) as unknown as Promise<AccountSnapshotRow[]>,
  ]);

  const posts = postRows.map(postFromRow);
  const viewDataPosts = posts.filter((post) => post.metrics.views !== null);
  const completeInteractionPosts = posts.filter((post) => hasCompleteInteractionData(post.metrics));
  const rateReadyPosts = completeInteractionPosts.filter((post) => post.metrics.views !== null && post.metrics.views > 0);
  const totalViews = sumKnown(viewDataPosts.map((post) => post.metrics.views));
  const totalInteractions = sumKnown(completeInteractionPosts.map((post) => interactionTotal(post.metrics)));
  const rateViews = sumKnown(rateReadyPosts.map((post) => post.metrics.views));
  const rateInteractions = sumKnown(rateReadyPosts.map((post) => interactionTotal(post.metrics)));
  const totalRate = rateViews && rateInteractions !== null ? (rateInteractions / rateViews) * 100 : null;
  const history = historyRows.map((row) => ({
    label: new Date(row.captured_on).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", timeZone: "UTC" }),
    value: numberOrNull(row.views),
  }));
  const currentHistory = history.at(-1)?.value ?? null;
  const previousHistory = history.at(-2)?.value ?? null;
  const followers = numberOrNull(accountRows[0]?.followers_count);
  const previousFollowers = numberOrNull(accountRows[1]?.followers_count);
  const topPosts = [...posts].sort((a, b) => (b.metrics.views ?? -1) - (a.metrics.views ?? -1)).slice(0, 5);

  const hourGroups = new Map<number, number[]>();
  for (const post of posts) {
    if (!post.publishedAt || post.metrics.views === null) continue;
    const hour = taipeiHour(post.publishedAt);
    if (hour === null) continue;
    hourGroups.set(hour, [...(hourGroups.get(hour) ?? []), post.metrics.views]);
  }
  const bestHour = [...hourGroups.entries()]
    .map(([hour, values]) => ({ hour, average: values.reduce((a, b) => a + b, 0) / values.length, count: values.length }))
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.average - a.average)[0];

  const syncedPosts = posts.length;
  const completeSuffix = viewDataPosts.length === syncedPosts ? "" : "（部分資料）";
  return {
    connected: true,
    demo: false,
    username: connection.username,
    displayName: connection.display_name ?? connection.username,
    lastSyncedAt: connection.last_synced_at ? new Date(connection.last_synced_at).toISOString() : null,
    syncError: connection.last_sync_error,
    cards: [
      { label: `已同步貼文累計瀏覽${completeSuffix}`, value: totalViews, change: percentChange(currentHistory, previousHistory), detail: `${viewDataPosts.length}/${syncedPosts} 則有資料；非獨立訪客` },
      { label: `內容互動${completeInteractionPosts.length === syncedPosts ? "" : "（部分資料）"}`, value: totalInteractions, change: null, detail: `${completeInteractionPosts.length}/${syncedPosts} 則含完整互動指標` },
      { label: "互動率", value: totalRate, suffix: "%", change: null, detail: `以 ${rateReadyPosts.length} 則指標完整的貼文計算` },
      { label: "追蹤者", value: followers, change: percentChange(followers, previousFollowers), detail: "目前追蹤人數" },
    ],
    trend: history.slice(-14),
    topPosts,
    insight: bestHour
      ? { title: `初步觀察：台北時間 ${String(bestHour.hour).padStart(2, "0")}:00 發布的貼文，目前平均瀏覽最高。`, detail: `依 ${bestHour.count} 則貼文發布以來的累計瀏覽比較；貼文新舊會影響結果，不代表因果。` }
      : { title: "再累積幾次同步，就能初步比較發布時段。", detail: "至少需要同一時段兩則有瀏覽資料的貼文；結果會以台北時間呈現。" },
    dataScope: { syncedPosts, withViewData: viewDataPosts.length, syncLimit: getSyncPostLimit() },
    accountTraffic: { profileViews: numberOrNull(accountRows[0]?.views), clicks: numberOrNull(accountRows[0]?.clicks) },
  };
}

export async function getExportForSession(): Promise<Record<string, unknown> | null> {
  if (!isAppConfigured() || !hasDatabase()) return null;
  const connectionId = await getSessionConnectionId();
  if (!connectionId) return null;
  const connection = await getConnection(connectionId);
  if (!connection) return null;

  const [postRows, accountHistoryRows, postHistoryRows] = await Promise.all([
    loadPostRows(connectionId),
    db().query(
      `SELECT captured_on,captured_at,views,likes,replies,reposts,quotes,clicks,followers_count
       FROM account_metric_snapshots WHERE connection_id=$1 ORDER BY captured_on`,
      [connectionId],
    ) as unknown as Promise<AccountSnapshotRow[]>,
    db().query(
      `SELECT s.post_id,s.captured_on,s.captured_at,s.views,s.likes,s.replies,s.reposts,s.quotes,s.shares
       FROM post_metric_snapshots s JOIN threads_posts p ON p.id=s.post_id
       WHERE p.connection_id=$1 ORDER BY s.captured_on,s.post_id`,
      [connectionId],
    ) as unknown as Promise<Array<PostRow & { post_id: string; captured_on: string | Date; captured_at: string | Date }>>,
  ]);
  const posts = postRows.map(postFromRow);

  return {
    account: {
      threadsUserId: connection.threads_user_id,
      username: connection.username,
      displayName: connection.display_name,
      lastSyncedAt: connection.last_synced_at ? iso(connection.last_synced_at) : null,
    },
    scope: { exportedPosts: posts.length, dailyHistoryRetentionDays: Number(process.env.DATA_RETENTION_DAYS ?? 90) },
    posts,
    accountHistory: accountHistoryRows.map((row) => ({
      capturedOn: iso(row.captured_on).slice(0, 10),
      capturedAt: row.captured_at ? iso(row.captured_at) : null,
      profileViews: numberOrNull(row.views),
      likes: numberOrNull(row.likes),
      replies: numberOrNull(row.replies),
      reposts: numberOrNull(row.reposts),
      quotes: numberOrNull(row.quotes),
      clicks: numberOrNull(row.clicks),
      followersCount: numberOrNull(row.followers_count),
    })),
    postHistory: postHistoryRows.map((row) => ({
      postId: row.post_id,
      capturedOn: iso(row.captured_on).slice(0, 10),
      capturedAt: iso(row.captured_at),
      metrics: metricsFromRow(row),
    })),
  };
}
