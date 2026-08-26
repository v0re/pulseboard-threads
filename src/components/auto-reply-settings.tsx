"use client";

import { useState } from "react";
import styles from "@/app/subpage.module.css";

type AutoReplySettings = { enabled: boolean; enabledAt: string | null; dailyLimit: number };
type AutoReplyLog = {
  id: string; sourceUsername: string | null; status: string; category: string | null;
  skipReason: string | null; generatedReply: string | null; createdAt: string; publishedAt: string | null;
};

type Props = {
  initialSettings: AutoReplySettings;
  logs: AutoReplyLog[];
  openAIConfigured: boolean;
  scopesReady: boolean;
  missingScopes: string[];
  databaseReady: boolean;
  connected: boolean;
};

const statusLabels: Record<string, string> = {
  discovered: "已發現", generating: "分析中", ready: "待發布", publishing: "發布中",
  published: "已回覆", skipped: "已略過", failed: "失敗", uncertain: "結果待確認",
};
const logDateFormatter = new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Taipei" });

export function AutoReplySettingsPanel({
  initialSettings, logs, openAIConfigured, scopesReady, missingScopes, databaseReady, connected,
}: Props) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [dailyLimit, setDailyLimit] = useState(initialSettings.dailyLimit);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canEnable = connected && openAIConfigured && scopesReady && databaseReady;

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auto-reply/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, dailyLimit }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; settings?: AutoReplySettings };
      if (!response.ok) throw new Error(result.error ?? "設定未儲存");
      if (result.settings) {
        setEnabled(result.settings.enabled);
        setDailyLimit(result.settings.dailyLimit);
      }
      setMessage(enabled ? "已啟用；下次同步起會自動處理新回覆。" : "已關閉自動回覆。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "設定未儲存");
    } finally {
      setSaving(false);
    }
  }

  return <div className={styles.automationGrid}>
    <div>
      <label className={styles.toggleRow}>
        <input type="checkbox" checked={enabled} disabled={!canEnable && !initialSettings.enabled} onChange={(event) => setEnabled(event.target.checked)}/>
        <span><strong>啟用 AI 自動回覆</strong><small>一次啟用後，不需逐則確認；可隨時取消勾選並儲存。</small></span>
      </label>
      <label className={styles.fieldLabel} htmlFor="auto-reply-limit">每日最多回覆</label>
      <select id="auto-reply-limit" className={styles.select} value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))}>
        <option value={3}>3 則</option><option value={5}>5 則</option><option value={10}>10 則</option>
      </select>
      <div className={styles.actions}><button className={styles.primaryButton} type="button" onClick={save} disabled={saving || !connected || !databaseReady || (enabled && !canEnable)}>{saving ? "儲存中…" : "一鍵儲存"}</button>{connected && !scopesReady && <a className={styles.secondaryButton} href="/api/auth/threads">重新授權 Threads</a>}</div>
      {message && <p className={styles.notice} role="status">{message}</p>}
      {!connected && <p className={styles.notice}>先完成 Meta 與資料庫設定並連結 Threads；目前可預覽功能與安全範圍。</p>}
      {!openAIConfigured && <p className={styles.notice}>OpenAI 金鑰尚未加入這個部署；畫面不會顯示金鑰內容。</p>}
      {!databaseReady && <p className={styles.notice}>請先執行最新資料庫 migration，再啟用此功能。</p>}
      {connected && !scopesReady && <p className={styles.notice}>缺少新權限：{missingScopes.join("、")}。既有連線需要重新授權一次。</p>}
    </div>
    <div className={styles.guardrailBox}>
      <strong>自動回覆範圍</strong>
      <ul>
        <li>只分析自己貼文在啟用後收到的直接文字回覆。</li>
        <li>每則完整內容最多 100 字，並標示「AI 自動回覆」。</li>
        <li>敏感內容、提示注入、需查證或不確定內容一律略過。</li>
        <li>相同留言只處理一次；發布結果不明時不會重試。</li>
        <li>關閉後不再開始新回覆；已送到 Threads 的單一發布請求仍可能完成。</li>
        <li>Threads 官方 API 不支援自動按愛心，也無法掃描首頁動態。</li>
      </ul>
    </div>
    {logs.length > 0 && <div className={styles.logList}>
      <strong>最近執行紀錄</strong>
      {logs.map((log) => <div className={styles.logRow} key={log.id}>
        <div><span className={styles.logStatus}>{statusLabels[log.status] ?? log.status}</span><b>{log.sourceUsername ? `@${log.sourceUsername}` : "未知使用者"}</b></div>
        {log.generatedReply && <p>{log.generatedReply}</p>}
        {!log.generatedReply && log.skipReason && <p>原因：{log.skipReason}</p>}
        <time dateTime={log.publishedAt ?? log.createdAt}>{logDateFormatter.format(new Date(log.publishedAt ?? log.createdAt))}</time>
      </div>)}
    </div>}
  </div>;
}
