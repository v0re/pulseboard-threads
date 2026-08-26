# Pulseboard Threads Companion

這是 Pulseboard 的 Chrome Manifest V3 伴侶插件。它只會在使用者點擊「分析」後，暫時讀取目前 Threads 分頁的可見文字，在插件內完成簡單統計與 100 字內草稿；關閉彈出視窗後不會保留內容。

## 安裝未封裝版本

1. 解壓縮下載的插件 ZIP。
2. 在 Chrome 開啟 `chrome://extensions/`。
3. 開啟右上角「開發人員模式」。
4. 按「載入未封裝項目」，選擇包含 `manifest.json` 的資料夾。
5. 開啟一篇 Threads 貼文，點擊工具列中的 Pulseboard 插件，再按「分析」。

ZIP 不能在一般 Windows／macOS Chrome 中直接點擊安裝；公開自動更新版本需要通過 Chrome Web Store 審查。

## 權限與隱私

- `activeTab`：只有點擊插件後，才暫時取得目前分頁權限。
- `scripting`：在目前分頁執行一次文字擷取；不注入常駐程式。
- 開啟 Pulseboard 使用固定網址，不需要額外網站權限，也不會附帶貼文內容。
- 不包含 OpenAI、Meta、Threads 或 Vercel 金鑰。
- 不保存或上傳貼文文字，不讀取瀏覽歷史，也不發出分析用網路請求。
- 不自動按讚、不自動發布、不背景掃描 Threads 動態。

Threads 網站版的頁面結構可能改變；如果無法讀取，請先重新整理並開啟單篇貼文頁面。
