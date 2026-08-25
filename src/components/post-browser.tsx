"use client";

import { useMemo, useState } from "react";
import { formatMetric, formatPercent, interactionTotal } from "@/lib/analytics";
import type { PostViewModel } from "@/lib/types";
import styles from "./post-browser.module.css";

function typeLabel(type: string) {
  if (type.includes("VIDEO")) return "影片";
  if (type.includes("IMAGE") || type.includes("CAROUSEL")) return "圖像";
  return "文字";
}

export function PostBrowser({ posts, demo }: { posts: PostViewModel[]; demo: boolean }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");
  const [sort, setSort] = useState("views");
  const visible = useMemo(() => posts.filter((post) => {
    const matchesText = post.text.toLocaleLowerCase("zh-TW").includes(query.trim().toLocaleLowerCase("zh-TW"));
    return matchesText && (type === "ALL" || typeLabel(post.mediaType) === type);
  }).sort((a, b) => {
    if (sort === "date") return Date.parse(b.publishedAt || "0") - Date.parse(a.publishedAt || "0");
    if (sort === "engagement") return (b.engagementRate ?? -1) - (a.engagementRate ?? -1);
    return (b.metrics.views ?? -1) - (a.metrics.views ?? -1);
  }), [posts, query, type, sort]);

  return (
    <div>
      <div className={styles.toolbar}>
        <label className={styles.search}><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋自己的貼文文字" aria-label="搜尋貼文" /></label>
        <select value={type} onChange={(event) => setType(event.target.value)} aria-label="媒體類型"><option value="ALL">全部類型</option><option>文字</option><option>圖像</option><option>影片</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="排序方式"><option value="views">依瀏覽排序</option><option value="engagement">依互動率排序</option><option value="date">依日期排序</option></select>
      </div>
      {demo && <p className={styles.demoNote} role="note">目前顯示展示資料；連結 Threads 後即可瀏覽自己的真實貼文。</p>}
      <div className={styles.resultsHeader}><span aria-live="polite" aria-atomic="true">{visible.length} 則貼文</span><span>Threads 未提供的數字會顯示為「無資料」</span></div>
      <div className={styles.grid}>
        {visible.map((post) => (
          <article className={styles.card} key={post.id}>
            <div className={styles.meta}><span>{typeLabel(post.mediaType)}</span><time dateTime={post.publishedAt || undefined}>{post.publishedAt ? new Date(post.publishedAt).toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }) : "日期未知"}</time></div>
            <p className={styles.text}>{post.text}</p>
            <dl className={styles.metrics}>
              <div><dt>瀏覽</dt><dd>{formatMetric(post.metrics.views)}</dd></div><div><dt>互動（不含分享）</dt><dd>{formatMetric(interactionTotal(post.metrics))}</dd></div><div><dt>互動率</dt><dd>{formatPercent(post.engagementRate)}</dd></div>
            </dl>
            <div className={styles.detail}><span>讚 {formatMetric(post.metrics.likes)}</span><span>回覆 {formatMetric(post.metrics.replies)}</span><span>轉發 {formatMetric(post.metrics.reposts)}</span><span>引用 {formatMetric(post.metrics.quotes)}</span><span>分享 {formatMetric(post.metrics.shares)}</span></div>
            <a href={post.permalink} target="_blank" rel="noopener noreferrer">在 Threads 開啟 <span aria-hidden="true">↗</span><span className="srOnly">（另開分頁）</span></a>
          </article>
        ))}
      </div>
      {!visible.length && <div className={styles.empty}>找不到符合條件的貼文。</div>}
    </div>
  );
}
