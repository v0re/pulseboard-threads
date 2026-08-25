import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { DeleteDataForm } from "@/components/delete-data-form";
import { getDashboard } from "@/lib/dashboard";
import styles from "../subpage.module.css";

export const metadata: Metadata = { title: "資料刪除說明" };
export const dynamic = "force-dynamic";

export default async function DataDeletionPage() {
  const dashboard = await getDashboard();
  return <AppShell active="setup" username={dashboard.username} connected={dashboard.connected}><section className={`${styles.content} ${styles.legal}`}><header className={styles.header}><div><p className={styles.eyebrow}>DATA DELETION</p><h1>刪除你的資料</h1><p>刪除會立即移除 Access Token、帳號資料、貼文、全部快照與同步紀錄。</p></div></header><article className={styles.card}><h2>已登入時</h2><p>按下方按鈕並再次確認。資料庫外鍵會一併刪除所有關聯紀錄；此動作無法復原。</p>{dashboard.connected ? <div className={styles.actions}><DeleteDataForm className={styles.dangerButton}/></div> : <p className={styles.notice}>目前沒有已登入的 Threads 連線。</p>}<h2>無法登入時</h2><p>請聯絡這個 Pulseboard 部署的管理者，提供 Threads 使用者名稱與資料刪除請求。管理者應核對帳號擁有權後，在 30 天內完成刪除。部署者公開服務前，必須在此頁補上有效聯絡方式。</p><h2>Meta App 設定</h2><p>此頁可作為 Meta App Dashboard 的 Data Deletion Instructions URL。若改用自動 Data Deletion Callback，請另外實作並驗證 Meta 的 signed request。</p></article></section></AppShell>;
}
