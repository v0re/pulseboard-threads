import Link from "next/link";
import styles from "@/app/page.module.css";

const navItems = [
  { href: "/", label: "總覽", icon: "◫", key: "overview" },
  { href: "/posts", label: "我的貼文", icon: "≡", key: "posts" },
  { href: "/explore", label: "探索", icon: "⌕", key: "explore" },
  { href: "/setup", label: "連線設定", icon: "⚙", key: "setup" },
] as const;

export function AppShell({ children, active, username, connected }: { children: React.ReactNode; active: typeof navItems[number]["key"]; username: string; connected: boolean }) {
  return (
    <main className={styles.appShell}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/"><span className={styles.brandMark} aria-hidden="true">◎</span><span>Pulseboard</span></Link>
        <p className={styles.brandCaption}>Threads 數據助手</p>
        <nav className={styles.nav} aria-label="主要導覽">
          {navItems.map((item) => <Link aria-current={active === item.key ? "page" : undefined} className={active === item.key ? styles.navActive : undefined} href={item.href} key={item.key}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
        </nav>
        <div className={styles.sidebarBottom}>
          <Link href="/privacy"><span aria-hidden="true">ⓘ</span>隱私與資料</Link>
          <div className={styles.accountMini}>
            <span className={styles.avatar} aria-hidden="true">{username.slice(0, 1).toUpperCase()}</span>
            <span><strong>@{username}</strong><small>{connected ? "已連結 Threads" : "展示模式"}</small></span>
          </div>
        </div>
      </aside>
      {children}
    </main>
  );
}
