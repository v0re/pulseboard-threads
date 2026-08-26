# Pulseboard

Pulseboard 是一套可部署到 Vercel 的 Threads 分析儀表板。它透過 Meta 官方 Threads API 讀取已授權帳號的貼文與 Insights，保存每日快照，提供趨勢、熱門貼文、篩選瀏覽、JSON 匯出、公開搜尋，以及預設關閉的 AI 自動回覆。

> 非 Meta 或 OpenAI 官方產品。官方 API 不支援自動按讚或首頁動態掃描；本專案也不會自動追蹤、重複開啟貼文或製造瀏覽量。自動回覆必須由帳號擁有者明確啟用。

## 功能

- Threads OAuth，含單次 `state` 防偽驗證。
- Access Token 以 AES-256-GCM 加密後保存。
- 貼文指標：`views`、`likes`、`replies`、`reposts`、`quotes`、`shares`。
- 帳號瀏覽、連結點擊與追蹤者快照。
- 每日 Vercel Cron 與手動同步。
- 資料庫鎖與每日唯一鍵，防止 Cron 重複或重疊寫入。
- 貼文全文搜尋、媒體類型篩選與成效排序。
- 官方 `keyword_search` 公開搜尋；只在使用者送出查詢時執行。
- 可選 AI 自動回覆：只處理啟用後、自己貼文收到的直接文字回覆；每日 3／5／10 則、去重、敏感內容跳過、完整輸出最多 100 字並標示 AI。
- OpenAI Moderations + Responses API（`store: false`）；資料庫不保存收到的留言全文，只保留最小來源 reply ID 收據以永久去重，並在刪除連線時一併清除。
- JSON 匯出（含帳號與貼文歷史快照）、立即中斷連線與完整資料刪除。
- Demo 模式：缺少環境變數時仍可安全預覽介面。
- Chrome Manifest V3 伴侶插件：使用者點擊後才讀取目前 Threads 貼文，在本機提供摘要指標與 100 字內草稿；不保存、不上傳、不自動發布。

Pulseboard 不會顯示「誰看過貼文」、獨立訪客、首頁動態或私人瀏覽歷史，因為 Threads API 沒有提供這些資料。缺少的指標會顯示為「無資料」，不會被當成 `0`。

每次同步預設讀取最近 100 則貼文（可調整為 10–250）；介面會同時顯示已同步數量與有資料的數量，不會把局部資料包裝成完整帳號總計。發布時段只做台北時間的初步比較，並清楚提示貼文新舊與樣本量偏差。

## 架構

- Next.js 16 App Router / Node.js Runtime
- Vercel Functions + Vercel Cron
- Neon Postgres（透過 Vercel Marketplace）
- Meta Threads API `https://graph.threads.com/v1.0`

資料表 migration 位於 [`migrations`](migrations)，執行器會以 transaction 與 `schema_migrations` 留存版本。每日快照以 `(post_id, captured_on)` 或 `(connection_id, captured_on)` 作為唯一鍵，因此重跑同一天同步是冪等的。

## 本機啟動

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

未填環境變數時，首頁會以 Demo 模式啟動。真正連結 Threads 前，需要完成下列設定。

## Meta App 設定

1. 在 [Meta for Developers](https://developers.facebook.com/) 建立 App，加入 Threads use case。
2. 申請最小權限：
   - `threads_basic`
   - `threads_manage_insights`
   - `threads_keyword_search`
   - `threads_read_replies`
   - `threads_manage_replies`
   - `threads_content_publish`
3. 把正式網域的 Callback 加入 Valid OAuth Redirect URIs：

```text
https://你的網域/api/auth/threads/callback
```

4. 將 `THREADS_APP_ID` 與 `THREADS_APP_SECRET` 加入 Vercel Production 環境變數。

App 角色可以在開發模式測試未審核權限；提供給其他 Threads 使用者前，必須完成 Meta App Review、發布 App，並提供可公開存取的隱私政策與資料刪除說明。本專案已包含 `/privacy` 與 `/data-deletion`，但部署者仍需補上有效聯絡方式。

## Vercel / Neon 設定

1. 建立 Vercel 專案。
2. 從 Vercel Marketplace 建立 Neon Postgres；不要使用已停止的新建 Vercel Postgres/KV 舊產品。
3. 設定：

```text
APP_URL
THREADS_REDIRECT_URI
THREADS_APP_ID
THREADS_APP_SECRET
DATABASE_URL
OPENAI_API_KEY
APP_ENCRYPTION_KEY
SESSION_SECRET
CRON_SECRET
```

AI 自動回覆需要 OpenAI Platform API billing 已啟用；ChatGPT 訂閱不會自動轉成 API 額度。啟用開關時，伺服器會先以不含使用者資料的合成文字檢查 Moderation 與 Responses API，任一服務不可用就維持關閉。

三個秘密可各自用 `openssl rand -base64 32` 產生。`APP_ENCRYPTION_KEY` 與 `SESSION_SECRET` 必須是不同的 32-byte 隨機值；網站會拒絕短密碼或重複金鑰。不要使用 `NEXT_PUBLIC_` 前綴。

4. 拉下 Production 環境後執行 migration：

```bash
vercel env pull .env.local --environment=production
npm run db:migrate
```

5. 部署 Production。`vercel.json` 會在每日 `01:17 UTC`（台北時間約 09:17）呼叫 `/api/cron/sync`。Vercel 自動把 `CRON_SECRET` 送入 Bearer Authorization header，路由也會再次驗證。

Vercel Hobby 的 Cron 最快每日一次且執行時間可能落在指定小時內；需要每小時或更密集快照時使用 Pro 並修改 cron expression。Cron 只在 Production deployment 執行。

## 安全設計

- OAuth Callback 必須與 Meta App 設定完全一致。
- OAuth code 只在伺服器交換，Access Token 永不傳到前端。
- Session 使用 HMAC 簽章、`HttpOnly`、`SameSite=Lax`，Production 加上 `Secure`。
- Session 內含伺服器驗證的到期時間與版本；同一帳號重新授權時會撤銷舊 Session。
- Token 在資料庫中使用 AES-256-GCM 加密。
- 所有資料查詢以 Session 的 `connection_id` 限定範圍。
- 手動同步與刪除要求同源 POST。
- 公開搜尋使用同源 POST；配額以資料庫原子計數，每個連線每分鐘最多 10 次、每日最多 2,000 次，搜尋字詞不寫入資料庫或 URL。
- Cron 使用資料庫租約鎖，快照使用唯一鍵保持冪等。
- Cron 會在 Vercel 強制中止前主動停止、取消尚未完成的 API 請求並正常結束同步紀錄。
- UI 只把 Threads 內容當純文字渲染，不代理抓取任意外部 URL。
- 自動回覆總開關預設關閉；只處理啟用時間後的直接回覆，並在發布前重新檢查開關與台北日界的每日上限。
- 收到的文字先經本機高風險規則、OpenAI Moderation、固定 strict JSON schema 與輸出再審查；任何不確定狀況不發布。
- 每個來源 reply ID 只能建立一筆工作。發布採 at-most-once：若 Threads 回覆結果不明，不會自動重試而造成重複留言。

建議正式上線前把 `THREADS_ALLOWED_USER_IDS` 設成允許的 Threads user ID，直到 Meta 審核完成。

## 驗證

```bash
npm run lint
npm test
npm run build
npm run extension:check
```

## Chrome 插件

插件原始碼與安裝說明位於 [`extension`](extension)。它只要求 `activeTab` 與 `scripting`；沒有網站常駐權限、背景服務、常駐 content script、遠端程式碼或任何 API 金鑰。下載後解壓縮，在 `chrome://extensions/` 開啟開發人員模式並載入包含 `manifest.json` 的資料夾即可測試。一般使用者若要從商店一鍵安裝，仍需另外提交 Chrome Web Store 審查。

GitHub Actions 會在每次 push 與 PR 自動執行 lint、測試和正式建置；Dependabot 每週檢查 npm 與 GitHub Actions 相依套件，並針對可用更新建立修復 PR。任意功能 PR 不會在未審核的情況下取得部署或 OpenAI 密鑰。

## 授權

MIT
