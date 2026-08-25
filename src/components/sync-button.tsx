"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton({ className }: { className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");

  async function sync() {
    setState("running");
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      if (!response.ok) throw new Error("sync failed");
      setState("done");
      router.refresh();
    } catch { setState("error"); }
  }

  const label = state === "running" ? "同步中…" : state === "done" ? "已完成" : state === "error" ? "重試同步" : "立即同步";
  const status = state === "running" ? "正在同步 Threads 資料" : state === "done" ? "Threads 資料同步完成" : state === "error" ? "同步未完成，請重試" : "";
  return <><button className={className} type="button" onClick={sync} disabled={state === "running"} aria-busy={state === "running"}>{label}</button><span className="srOnly" role="status" aria-live="polite" aria-atomic="true">{status}</span></>;
}
