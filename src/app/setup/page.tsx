import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AutoReplySettingsPanel } from "@/components/auto-reply-settings";
import { DeleteDataForm } from "@/components/delete-data-form";
import { SyncButton } from "@/components/sync-button";
import { getAutoReplyPageData } from "@/lib/auto-reply-page";
import { getDashboard } from "@/lib/dashboard";
import { getThreadsRedirectUri, invalidConfiguration, missingProductionConfiguration } from "@/lib/env";
import styles from "../subpage.module.css";

export const metadata: Metadata = { title: "連線設定" };
export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  not_configured: "網站尚未完成伺服器環境設定。", oauth_denied: "你取消了 Threads 授權；沒有任何資料被保存。",
  invalid_state: "授權驗證已過期或不一致，請重新連結。", not_allowed: "此 Threads 帳號不在部署者設定的允許名單。",
  oauth_failed: "Threads 授權未完成，請核對 Meta App 設定與 Callback URL。",
};

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  const [dashboard, params, autoReply] = await Promise.all([getDashboard(), searchParams, getAutoReplyPageData()]);
  const missing = missingProductionConfiguration();
  const invalid = invalidConfiguration();
  const callback = getThreadsRedirectUri();
  const error = params.error ? errorMessages[params.error] ?? "設定未完成。" : params.deleted ? "連線與保存的資料已刪除。" : null;
  return <AppShell active="setup" username={dashboard.username} connected={dashboard.connected}><section className={styles.content}>
    <header className={styles.header}><div><p className={styles.eyebrow}>CONNECTION & PRIVACY</p><h1>連線設定</h1><p>把 Meta App、Vercel 與 Neon 接在一起。正式服務他人前，還需要完成 Meta App Review。</p></div>{dashboard.connected ? <span className={styles.badge}>@{dashboard.username} 已連結</span> : <span className={`${styles.badge} ${styles.badgeOff}`}>尚未連結</span>}</header>
    {error && <div className={styles.notice}>{error}</div>}
    <div className={styles.grid}>
      <article className={styles.card}><h2 className={styles.cardTitle}>1. 建立 Meta Threads App</h2><p className={styles.cardCopy}>在 Meta for Developers 建立 Threads use case，加入分析、搜尋與選用自動回覆所需權限，並把 Callback URL 完整貼入 Valid OAuth Redirect URIs。</p><ul className={styles.list}><li><span>01</span><div><strong>threads_basic</strong>讀取自己的個人檔案與貼文。</div></li><li><span>02</span><div><strong>threads_manage_insights</strong>讀取帳號與貼文 Insights。</div></li><li><span>03</span><div><strong>threads_keyword_search</strong>使用者主動送出時搜尋公開貼文；公開使用通常需要 App Review。</div></li><li><span>04</span><div><strong>threads_read_replies</strong>讀取自己貼文收到的回覆。</div></li><li><span>05</span><div><strong>threads_manage_replies</strong>代表已授權帳號建立回覆。</div></li><li><span>06</span><div><strong>threads_content_publish</strong>完成 Threads 官方回覆發布流程與額度查詢。</div></li></ul><div className={styles.codeGrid}><code className={styles.codeRow}>{callback}</code></div></article>
      <article className={styles.card}><h2 className={styles.cardTitle}>2. 建立資料庫與環境設定</h2><p className={styles.cardCopy}>在 Vercel Marketplace 建立 Neon Postgres，套用附帶的資料表設定，接著填入下列伺服器端秘密。預覽版與正式版建議使用不同資料庫。</p><div className={styles.codeGrid}>{["DATABASE_URL","THREADS_APP_ID","THREADS_APP_SECRET","OPENAI_API_KEY","APP_ENCRYPTION_KEY","SESSION_SECRET","CRON_SECRET","APP_URL"].map((name)=><code className={styles.codeRow} key={name}>{name}</code>)}</div>{missing.length > 0 && <div className={styles.notice}>目前尚缺：{missing.join("、")}</div>}{invalid.length > 0 && <div className={styles.notice}>設定值不安全或無效：{invalid.join("、")}</div>}</article>
    </div>
    <article className={styles.card}><h2 className={styles.cardTitle}>3. 連結與同步</h2><p className={styles.cardCopy}>Vercel Hobby 會每日自動同步一次；Pro 可調整為更頻繁。你也可以隨時手動同步。憑證只會加密保存在伺服器端。</p><div className={styles.actions}>{dashboard.connected ? <><SyncButton className={styles.primaryButton}/><a className={styles.secondaryButton} href="/api/export">匯出 JSON</a></> : <a className={styles.primaryButton} href="/api/auth/threads">連結 Threads</a>}<a className={styles.secondaryButton} href="https://developers.facebook.com/docs/threads/" target="_blank" rel="noopener noreferrer">官方 Threads API 文件 ↗</a></div><p className={styles.notice}>Pulseboard 不會取得誰看過貼文、獨立訪客、首頁動態或私人瀏覽歷史；API 也沒有提供這些資料。</p></article>
    <article className={styles.card}><h2 className={styles.cardTitle}>4. AI 自動回覆</h2><p className={styles.cardCopy}>只要啟用一次，系統會在同步時分析自己貼文收到的新回覆，不再逐則要求確認。Vercel Hobby 每日執行一次，因此可能延遲近 24 小時。</p><AutoReplySettingsPanel initialSettings={autoReply.settings} logs={autoReply.logs} openAIConfigured={autoReply.openAIConfigured} scopesReady={autoReply.scopesReady} missingScopes={autoReply.missingScopes} databaseReady={autoReply.databaseReady} connected={dashboard.connected}/></article>
    <article className={styles.card}><h2 className={styles.cardTitle}>5. Chrome 伴侶插件</h2><p className={styles.cardCopy}>在單篇 Threads 貼文頁按一下插件，即可於本機分析目前貼文、查看字數與回覆提示，並建立完整 100 字內的草稿。插件沒有網站常駐權限，不會保存、上傳、自動按讚或自動發布。</p><div className={styles.actions}><a className={styles.primaryButton} href="https://github.com/v0re/pulseboard-threads/releases/download/v1.2.0/Pulseboard-Chrome-1.2.0.zip">下載 Chrome 插件 1.2.0</a><a className={styles.secondaryButton} href="https://github.com/v0re/pulseboard-threads/tree/main/extension" target="_blank" rel="noopener noreferrer">安裝說明與原始碼 ↗</a></div><p className={styles.notice}>下載後先解壓縮，再到 chrome://extensions 開啟開發人員模式，選擇「載入未封裝項目」並指定包含 manifest.json 的資料夾。</p></article>
    <article className={`${styles.card} ${styles.dangerZone}`}><h2 className={styles.cardTitle}>資料控制</h2><p className={styles.cardCopy}>匯出目前資料，或刪除憑證、貼文與全部歷史快照。刪除後無法復原。</p><div className={styles.actions}><a className={styles.secondaryButton} href="/privacy">隱私政策</a><a className={styles.secondaryButton} href="/data-deletion">資料刪除說明</a>{dashboard.connected && <DeleteDataForm className={styles.dangerButton}/>}</div></article>
  </section></AppShell>;
}
