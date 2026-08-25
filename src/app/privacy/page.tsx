import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getDashboard } from "@/lib/dashboard";
import styles from "../subpage.module.css";

export const metadata: Metadata = { title: "隱私政策", description: "Pulseboard 的資料處理與保留說明。" };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const dashboard = await getDashboard();
  return <AppShell active="setup" username={dashboard.username} connected={dashboard.connected}><section className={`${styles.content} ${styles.legal}`}><header className={styles.header}><div><p className={styles.eyebrow}>PRIVACY</p><h1>隱私政策</h1><p>最後更新：2026 年 8 月 26 日</p></div></header><article className={styles.card}>
    <h2>我們處理哪些資料</h2><p>使用者主動透過 Meta OAuth 授權後，Pulseboard 會取得 Threads 帳號識別、使用者名稱、自己的貼文，以及官方 API 提供的貼文與帳號 Insights。公開搜尋只在使用者送出查詢時執行，搜尋結果預設不保存。</p>
    <h2>資料用途</h2><p>資料只用於向已連結的同一位使用者顯示趨勢、比較貼文表現、匯出報告及維持同步。工具不會販售資料，也不會用來自動按讚、追蹤、回覆或製造瀏覽量。</p>
    <h2>保存與安全</h2><p>Threads Access Token 以 AES-256-GCM 加密後保存在 Postgres，金鑰位於 Vercel 伺服器秘密。每日指標快照、同步與稽核紀錄預設保存 90 天，排程會依部署者設定自動清理。Token、App Secret 與加密金鑰不會傳到瀏覽器。</p>
    <h2>第三方與限制</h2><p>本工具使用 Meta Threads API、Vercel 與部署者選擇的 Neon Postgres。Pulseboard 不是 Meta 官方產品。Threads API 不提供觀眾身分、獨立瀏覽者、首頁動態或使用者的私人瀏覽歷史。</p>
    <h2>你的權利</h2><p>你可以隨時下載 JSON 匯出，或在連線設定中永久刪除憑證、貼文與全部快照。若無法登入，可依照<a href="/data-deletion">資料刪除說明</a>聯絡部署者。</p>
  </article></section></AppShell>;
}
