import { AppShell } from "@/components/app-shell";
import { SyncButton } from "@/components/sync-button";
import { formatMetric, formatPercent } from "@/lib/analytics";
import { getDashboard } from "@/lib/dashboard";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function formatTime(value: string | null): string {
  return value ? new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(value)) : "尚未同步";
}

function mediaLabel(mediaType: string): string {
  if (mediaType.includes("VIDEO")) return "影片";
  if (mediaType.includes("IMAGE") || mediaType.includes("CAROUSEL")) return "圖像";
  return "文字";
}

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Taipei",
  }).format(new Date()));
  if (hour < 11) return "早安";
  if (hour < 18) return "午安";
  return "晚安";
}

export default async function Home() {
  const model = await getDashboard();
  const trendPoints = model.trend.length ? model.trend : [{ label: "今天", value: null }];
  const maxTrend = Math.max(...trendPoints.map((point) => point.value ?? 0), 1);
  const trendDescription = trendPoints.map((point) => `${point.label}：${point.value === null ? "無資料" : `${formatMetric(point.value)} 次`}`).join("；");

  return (
    <AppShell active="overview" username={model.username} connected={model.connected}>
      <section className={styles.content} id="overview">
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>THREADS 成效總覽</p><h1>{model.connected ? `@${model.username} 的內容脈搏` : `${greeting()}，來看看內容的脈搏。`}</h1></div>
          <div className={styles.headerActions}>
            <span className={styles.freshness}>最後更新：{formatTime(model.lastSyncedAt)}</span>
            {model.connected ? <SyncButton className={styles.connectButton} /> : <a className={styles.connectButton} href="/api/auth/threads">連結 Threads</a>}
          </div>
        </header>

        <div className={`${styles.demoBanner} ${model.syncError ? styles.errorBanner : ""}`}>
          <span className={styles.demoDot} aria-hidden="true" />
          <div><strong>{model.syncError ? "上次同步未完成" : model.demo ? "這是安全展示資料" : "已透過官方 API 連線"}</strong><span>{model.syncError ?? (model.demo ? "連結自己的 Threads 帳號後，才會顯示真實 Insights。" : "缺少的指標會顯示為「無資料」，不會被誤算成 0。")}</span></div>
          <a href="/setup">查看設定 →</a>
        </div>

        <section className={styles.metrics} aria-label="主要指標">
          {model.cards.map((card, index) => (
            <article className={index === 0 ? styles.metricPrimary : styles.metricCard} key={card.label}>
              <p>{card.label}</p><strong>{card.suffix === "%" ? formatPercent(card.value) : formatMetric(card.value)}</strong>
              <span className={styles.deltaUp}>{card.change === null ? "—" : `${card.change >= 0 ? "↑" : "↓"} ${Math.abs(card.change).toFixed(1)}%`}</span><small>{card.detail}</small>
            </article>
          ))}
        </section>

        <aside className={styles.dataContext} aria-label="資料涵蓋範圍與帳號流量">
          <p><strong>資料範圍：</strong>已同步最近 {model.dataScope.syncedPosts} 則貼文（每次最多 {model.dataScope.syncLimit} 則），其中 {model.dataScope.withViewData} 則有瀏覽資料；這些數字不代表帳號中的所有貼文。</p>
          <dl>
            <div><dt>個人檔案瀏覽</dt><dd>{formatMetric(model.accountTraffic.profileViews)}</dd></div>
            <div><dt>連結點擊</dt><dd>{formatMetric(model.accountTraffic.clicks)}</dd></div>
          </dl>
        </aside>

        <section className={styles.mainGrid}>
          <article className={styles.chartCard}>
            <div className={styles.cardHeader}><div><p>已同步貼文累計瀏覽趨勢</p><h2>{model.trend.length > 1 ? "每日快照變化" : "等待下一次每日快照"}</h2></div><span className={styles.periodPill}>最近 14 筆</span></div>
            <div className={styles.chart} role="img" aria-label={`已同步貼文累計瀏覽趨勢長條圖。${trendDescription}`}>
              {trendPoints.map((point, index) => <div className={styles.barSlot} key={`${point.label}-${index}`}>{point.value === null ? <span className={styles.barUnknown} title="無資料"><span aria-hidden="true">—</span></span> : <span className={styles.bar} style={{ height: `${Math.max((point.value / maxTrend) * 100, point.value ? 4 : 1)}%` }} />}<small>{point.label}</small></div>)}
            </div>
            <p className={styles.chartNote}>「—」代表 Threads 未提供該筆瀏覽資料，不會當成 0 計算。</p>
            <ul className="srOnly" aria-label="趨勢資料文字版">{trendPoints.map((point, index) => <li key={`trend-text-${point.label}-${index}`}>{point.label}：{point.value === null ? "無資料" : `${formatMetric(point.value)} 次`}</li>)}</ul>
          </article>
          <aside className={styles.insightCard}><div className={styles.insightLabel}>資料洞察</div><span className={styles.spark} aria-hidden="true">✦</span><h2>{model.insight.title}</h2><p>{model.insight.detail}</p><a href="/posts">檢視貼文數據 <span aria-hidden="true">→</span></a></aside>
        </section>

        <section className={styles.postsSection} id="posts">
          <div className={styles.sectionHeader}><div><p>已同步內容表現</p><h2>熱門貼文</h2></div><a href="/posts">瀏覽已同步貼文 <span aria-hidden="true">→</span></a></div>
          <div className={styles.postsTable}>
            <div className={styles.tableHead}><span>貼文</span><span>瀏覽</span><span>互動率</span><span /></div>
            {model.topPosts.length ? model.topPosts.map((post) => (
              <article className={styles.postRow} key={post.id}>
                <div className={styles.postContent}><div><span className={styles.typePill}>{mediaLabel(post.mediaType)}</span><time>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("zh-TW") : "日期未知"}</time></div><p>{post.text}</p></div>
                <strong className={styles.postMetric} aria-label={`瀏覽 ${formatMetric(post.metrics.views)}`}><span>瀏覽</span>{formatMetric(post.metrics.views)}</strong><strong className={styles.postMetric} aria-label={`互動率 ${formatPercent(post.engagementRate)}`}><span>互動率</span>{formatPercent(post.engagementRate)}</strong>
                <a href={post.permalink} target="_blank" rel="noopener noreferrer" aria-label="在 Threads 開啟貼文（另開分頁）"><span aria-hidden="true">↗</span></a>
              </article>
            )) : <p className={styles.emptyState}>尚未取得貼文。請先執行同步。</p>}
          </div>
        </section>
        <footer className={styles.footer}>非 Meta 官方產品。只讀取使用者明確授權的 Threads API 資料；不會製造瀏覽量。</footer>
      </section>
    </AppShell>
  );
}
