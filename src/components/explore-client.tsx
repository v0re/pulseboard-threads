"use client";

import { FormEvent, useState } from "react";
import type { ThreadsPost } from "@/lib/types";
import styles from "./explore-client.module.css";

function mediaLabel(type?: string): string {
  if (type?.includes("VIDEO")) return "影片";
  if (type?.includes("IMAGE") || type?.includes("CAROUSEL")) return "圖像";
  return "文字貼文";
}

export function ExploreClient({ connected }: { connected: boolean }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("TOP");
  const [mode, setMode] = useState("KEYWORD");
  const [posts, setPosts] = useState<ThreadsPost[]>([]);
  const [message, setMessage] = useState(connected ? "只有送出搜尋時才會向 Threads 取回結果；搜尋內容和結果不會永久保存。" : "請先連結 Threads 帳號。公開搜尋可能需要先在 Meta 完成權限審核。");
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!connected || query.trim().length < 2) return;
    setLoading(true); setMessage("正在搜尋 Threads…");
    try {
      const response = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), type, mode }),
      });
      const data = await response.json() as { ok?: boolean; posts?: ThreadsPost[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "搜尋失敗");
      setPosts(data.posts ?? []); setMessage((data.posts ?? []).length ? `找到 ${(data.posts ?? []).length} 則由 Meta 排序的結果。` : "沒有搜尋結果；空結果不代表 Threads 上完全沒有相關貼文。");
    } catch (error) { setPosts([]); setMessage(error instanceof Error ? error.message : "搜尋失敗"); }
    finally { setLoading(false); }
  }

  return <div>
    <form className={styles.searchPanel} onSubmit={search} aria-busy={loading}>
      <label><span>搜尋字詞</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="例如：Windows、AI 工具、產品設計" minLength={2} maxLength={100} disabled={!connected} autoComplete="off" /></label>
      <label><span>搜尋模式</span><select value={mode} onChange={(event)=>setMode(event.target.value)} disabled={!connected}><option value="KEYWORD">關鍵字</option><option value="TAG">主題標籤</option></select></label>
      <label><span>排序</span><select value={type} onChange={(event)=>setType(event.target.value)} disabled={!connected}><option value="TOP">熱門</option><option value="RECENT">最近</option></select></label>
      <button type="submit" disabled={!connected || loading || query.trim().length < 2}>{loading ? "搜尋中…" : "搜尋 Threads"}</button>
    </form>
    <div className={styles.notice} role="status" aria-live="polite" aria-atomic="true">{message}</div>
    <div className={styles.grid} role="region" aria-label="Threads 搜尋結果" aria-busy={loading}>
      {posts.map((post)=><article key={post.id} className={styles.card}><div className={styles.meta}><strong>@{post.username ?? "未知帳號"}</strong><time dateTime={post.timestamp}>{post.timestamp ? new Date(post.timestamp).toLocaleString("zh-TW", { dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Taipei" }) : "日期未知"}</time></div><p>{post.text || "（無文字內容）"}</p><div className={styles.cardFooter}><span>{mediaLabel(post.media_type)}</span><a href={post.permalink ?? "https://www.threads.com/"} target="_blank" rel="noopener noreferrer">開啟原文 <span aria-hidden="true">↗</span><span className="srOnly">（另開分頁）</span></a></div></article>)}
    </div>
  </div>;
}
