import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { PostBrowser } from "@/components/post-browser";
import { getAllPostsForSession, getDashboard } from "@/lib/dashboard";
import styles from "../subpage.module.css";

export const metadata: Metadata = { title: "我的貼文" };
export const dynamic = "force-dynamic";

export default async function PostsPage() {
  const [dashboard, posts] = await Promise.all([getDashboard(), getAllPostsForSession()]);
  return <AppShell active="posts" username={dashboard.username} connected={dashboard.connected}><section className={styles.content}><header className={styles.header}><div><p className={styles.eyebrow}>已同步貼文</p><h1>我的貼文</h1><p>搜尋、篩選並比較目前已同步的 {dashboard.dataScope.syncedPosts} 則內容；每次最多同步最近 {dashboard.dataScope.syncLimit} 則，數字來自 Threads 官方資料。</p></div></header><PostBrowser posts={posts} demo={dashboard.demo} /></section></AppShell>;
}
