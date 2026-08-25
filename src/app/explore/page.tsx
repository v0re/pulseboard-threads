import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ExploreClient } from "@/components/explore-client";
import { getDashboard } from "@/lib/dashboard";
import styles from "../subpage.module.css";

export const metadata: Metadata = { title: "探索 Threads" };
export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const dashboard = await getDashboard();
  return <AppShell active="explore" username={dashboard.username} connected={dashboard.connected}><section className={styles.content}><header className={styles.header}><div><p className={styles.eyebrow}>即時探索</p><h1>探索 Threads</h1><p>用關鍵字或主題標籤尋找公開貼文。只有送出搜尋時才會取回結果，不會在背景監控他人或反覆開啟貼文。</p></div></header><ExploreClient connected={dashboard.connected} /></section></AppShell>;
}
