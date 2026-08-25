"use client";

export function DeleteDataForm({ className }: { className?: string }) {
  return <form action="/api/disconnect" method="post" onSubmit={(event) => { if (!window.confirm("確定要中斷連線並永久刪除所有貼文快照與憑證嗎？此動作無法復原。")) event.preventDefault(); }}><button className={className} type="submit">中斷連線並刪除資料</button></form>;
}
