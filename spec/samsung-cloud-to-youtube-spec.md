# Samsung Cloud Quick Share → YouTube 自動上傳工具 — 規格書

> **版本**: 3.0
> **目標**: 本地執行 CLI 工具，給定 Samsung Cloud Quick Share 連結，自動下載影片、上傳至 YouTube 私人影片並歸入指定播放清單，完成後透過 Telegram 發送通知
> **技術棧**: Node.js + Playwright + YouTube Data API v3 + Telegram Bot API（僅通知）
> **執行環境**: 本地電腦（macOS / Windows / Linux）
> **日期**: 2026-04-02

---

## 一、專案結構

```
samsung-to-youtube/
├── package.json
├── .env                          # 環境變數（不進 git）
├── .env.example                  # 環境變數範本
├── .gitignore
├── credentials/
│   └── client_secrets.json       # Google OAuth2 憑證（從 GCP Console 下載）
│   └── tokens.json               # OAuth2 refresh token（首次授權後自動產生）
├── src/
│   ├── index.ts                  # CLI 入口
│   ├── samsung-downloader.ts     # Samsung Cloud 下載模組
│   ├── youtube-uploader.ts       # YouTube 上傳模組
│   ├── youtube-playlist.ts       # YouTube 播放清單管理模組
│   ├── telegram-notifier.ts      # Telegram 通知模組（單向發送，非 Bot 伺服器）
│   ├── config.ts                 # 設定檔讀取
│   └── utils.ts                  # 工具函式（日誌、清理暫存等）
├── downloads/                    # 暫存下載的影片（上傳完後自動清理）
└── tsconfig.json
```

---

## 二、Samsung Cloud 下載模組 — 逆向工程結果

### 2.1 頁面結構分析（已驗證）

Samsung Cloud Quick Share 頁面（`https://quickshare.samsungcloud.com/{shortCode}`）是一個 **jQuery 為基礎的 SPA**，核心邏輯在以下兩個 JS 檔案：

- `/resources/js/app/sharelink.js` — 主要下載邏輯
- `/resources/js/common/remoteshare.prototype.js` — 通用函式（含過期檢查等）

### 2.2 核心資料結構

頁面初始化時，會呼叫 `ShareLink.list.functions.init(options)`，其中 `options` 包含：

```javascript
{
  contextPath: '',                    // 路徑前綴（通常為空）
  contentsToken: '...',               // 連結的唯一 token（如 "1774935677176LTkJcBq"）
  requestTime: '...',                 // 請求時間戳
  contentsTotalCnt: 4,                // 檔案總數
  uploadCompleted: 'true',            // 是否上傳完成
  linkUrl: '...',                     // 完整連結
  linkUrlVersion: 'V1',              // 連結版本
  sharedatacontents: [                // ★ 核心：檔案清單陣列
    {
      contentsSequenceNo: '...',      // 內容序號
      name: '影片名稱.mp4',            // 檔案名稱（可能含 unicode escape）
      original: 'https://...直接下載URL', // ★ 直接下載網址
      contentType: 'video/mp4',       // MIME 類型
      // ...其他欄位
    }
  ]
}
```

### 2.3 下載機制（兩種方式）

#### 方式 A：個別下載（推薦用於程式化下載）
```
每個檔案的直接下載 URL = item.original
若 linkUrlVersion === 'V1'，則附加 &name=encodeURIComponent(fileName)
```

頁面下載邏輯為每 3 秒觸發一次 `window.location.href = url`，依序下載每個檔案。

#### 方式 B：ZIP 打包下載
```
POST /ls/public/v1/zip/signature?linkId={contentsToken}
Content-Type: application/json
Body: { "contentsSeqNos": ["seq1", "seq2", ...] }

Response: { "zipHost": "https://...", "signature": "..." }

最終下載 URL: {zipHost}/zip/v1/file?signature={signature}&zipName={name}&timeZone={tz}
```

### 2.4 關鍵 API 端點整理

| 端點 | 方法 | 說明 |
|------|------|------|
| `/contents/getContentsInfo.json?contentsToken={token}&callExtraInfo=refreshContents&linkUrlVersion={ver}` | GET | 取得/刷新內容清單 |
| `/ls/public/v1/zip/signature?linkId={token}` | POST | 產生 ZIP 下載簽名 |
| `/ls/public/v1/links/{linkKey}/contents/{contentId}/resized/760?signature={sig}` | GET | 縮圖 |
| `/common/recordDownloadLog.json?linkId={token}&downloadType={type}&totalContentsCount={n}&downloadContentsCount={n}` | GET | 下載統計記錄 |
| `item.original` | GET | 直接下載單一檔案（302 redirect 到實際檔案） |

### 2.5 過期與封鎖檢查

下載前頁面會呼叫 `RemoteShare.functions.checkContentsExpiry(contentsToken, 'download', linkUrlVersion)` 來確認連結是否仍有效。`refreshContentsUrl` 回傳的 `errorCode`:
- `129106` → 連結已被封鎖
- `129105` → 連結已被取消
- `expired: true` → 連結已過期

---

## 三、Samsung 下載模組實作規格

### 3.1 模組：`samsung-downloader.ts`

```typescript
interface SamsungContent {
  contentsSequenceNo: string;
  name: string;
  original: string;   // 直接下載 URL
  contentType: string;
}

interface SamsungShareData {
  contentsToken: string;
  linkUrlVersion: string;
  contentsTotalCnt: number;
  uploadCompleted: boolean;
  sharedatacontents: SamsungContent[];
}

interface DownloadResult {
  filePath: string;     // 本地檔案路徑
  fileName: string;     // 原始檔案名稱
  fileSize: number;     // 檔案大小 bytes
  contentType: string;
}
```

### 3.2 流程

```
輸入: Samsung Cloud Quick Share URL (如 https://quickshare.samsungcloud.com/74wr7EVRdGhV)

步驟:
1. 使用 Playwright 啟動 headless Chromium 瀏覽器
2. 導航至該 URL
3. 等待頁面載入完成（等待 #downloadAllBtn 元素出現）
4. 從頁面 context 中擷取 ShareLink.globals 物件：
   - await page.evaluate(() => ({
       contentsToken: window.ShareLink.globals.contentsToken,
       linkUrlVersion: window.ShareLink.globals.linkUrlVersion,
       sharedatacontents: window.ShareLink.globals.sharedatacontents,
       contentsTotalCnt: window.ShareLink.globals.contentsTotalCnt,
       uploadCompleted: window.ShareLink.globals.uploadCompleted
     }))
5. 驗證連結狀態（uploadCompleted, contentsTotalCnt > 0）
6. 遍歷 sharedatacontents，對每個影片檔案：
   a. 取得 item.original 作為下載 URL
   b. 若 linkUrlVersion === 'V1'，附加 &name=encodeURIComponent(item.name)
   c. 使用 Playwright 的 page.context().cookies() 取得 cookies
   d. 使用 Node.js 的 undici/fetch（或 got）帶 cookies 下載檔案到 downloads/ 目錄
   e. 下載時顯示進度條（使用 cli-progress）
7. 關閉瀏覽器
8. 回傳 DownloadResult[]

輸出: 已下載的影片檔案清單
```

### 3.3 注意事項

- Samsung Cloud 的下載 URL（`item.original`）通常是一個帶 signature 的直連 URL，有效期有限
- 下載時需要帶上從頁面取得的 cookies（可能包含 session 驗證）
- 如果連結有密碼保護（PIN），需要額外處理 `ShareLink.login.functions.checkPin()` 流程
- 某些 `item.original` 可能會 302 redirect，需要跟隨重定向
- 檔案名稱可能包含 unicode escape sequence，需用頁面內的 `unicodeToText()` 邏輯轉換

### 3.4 錯誤處理

| 情境 | 處理 |
|------|------|
| 連結過期 | 拋出 `LinkExpiredError`，附帶過期時間 |
| 連結被封鎖 | 拋出 `LinkBlockedError` |
| 頁面載入超時 | 30 秒 timeout，重試 1 次 |
| 單一檔案下載失敗 | 重試 3 次，指數退避（1s, 2s, 4s） |
| 磁碟空間不足 | 下載前檢查可用空間 |

---

## 四、YouTube 上傳模組實作規格

### 4.1 前置設定（需使用者手動完成一次）

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立專案或選擇既有專案
3. 啟用 **YouTube Data API v3**
4. 建立 OAuth 2.0 憑證 → 應用程式類型選「**桌面應用程式**」
5. 下載 JSON 並存為 `credentials/client_secrets.json`
6. 在 OAuth 同意畫面中，將自己的 Google 帳號加入測試使用者

### 4.2 模組：`youtube-uploader.ts`

```typescript
interface YouTubeUploadOptions {
  filePath: string;
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;   // 預設 "22" (People & Blogs)
  privacyStatus: 'private' | 'unlisted' | 'public';  // 預設 'private'
}

interface YouTubeUploadResult {
  videoId: string;
  title: string;
  url: string;     // https://youtu.be/{videoId}
  status: string;
}
```

### 4.3 OAuth2 授權流程

```
1. 讀取 credentials/client_secrets.json
2. 檢查 credentials/tokens.json 是否存在且未過期
   - 若存在且有效 → 直接使用 access_token
   - 若存在但過期 → 使用 refresh_token 取得新 access_token
   - 若不存在 → 啟動首次授權流程：
     a. 產生授權 URL
     b. 自動開啟瀏覽器讓使用者授權
     c. 啟動本地 HTTP server (localhost:3000) 接收 callback
     d. 用 authorization code 交換 access_token + refresh_token
     e. 儲存至 credentials/tokens.json
3. Scopes 需要: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube']
   - youtube.upload: 上傳影片
   - youtube: 管理播放清單（新增影片到播放清單需要此 scope）
```

### 4.4 上傳流程

```
使用 YouTube Data API v3 的 videos.insert 端點
- 採用 Resumable Upload 機制（支援大檔案、斷點續傳）

步驟:
1. 初始化 resumable upload session:
   POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
   Headers:
     Authorization: Bearer {access_token}
     Content-Type: application/json
     X-Upload-Content-Length: {file_size}
     X-Upload-Content-Type: video/*
   Body: {
     snippet: {
       title: "{影片標題}",
       description: "{描述}",
       tags: [...],
       categoryId: "22"
     },
     status: {
       privacyStatus: "private",
       selfDeclaredMadeForKids: false
     }
   }

   Response Header: Location → {resumable_upload_url}

2. 分塊上傳影片檔案:
   PUT {resumable_upload_url}
   Headers:
     Content-Range: bytes {start}-{end}/{total}
   Body: {binary_chunk}

   Chunk size: 10MB (建議值，需為 256KB 的倍數)

3. 上傳完成後取得 video resource 回應

4. 回傳 YouTubeUploadResult
```

### 4.5 影片命名規則

```
title 的生成邏輯:
1. 若有 --title-prefix，使用: "{prefix} - {原始檔名（去副檔名）}"
2. 若無 prefix，優先使用原始檔案名稱（去除副檔名）
3. 若檔案名稱為通用名（如 video_001.mp4），則使用：
   "Samsung Share - {YYYY-MM-DD} - {index}"
4. title 最大長度: 100 字元（YouTube 限制）

description 預設模板:
  "透過 Samsung Cloud Quick Share 自動上傳\n來源: {samsung_share_url}\n上傳時間: {timestamp}"
```

### 4.6 錯誤處理

| 情境 | 處理 |
|------|------|
| OAuth token 過期 | 自動 refresh，失敗則提示重新授權 |
| 上傳配額超限 (403) | 顯示錯誤訊息，建議隔天再試 |
| 檔案過大 (>256GB) | 提示 YouTube 限制 |
| 網路中斷 | Resumable upload 自動從斷點續傳，重試 5 次 |
| 非影片檔案 | 跳過，記錄 warning |

---

## 五、YouTube 播放清單管理模組

### 5.1 模組：`youtube-playlist.ts`

```typescript
interface PlaylistConfig {
  playlistId: string;           // YouTube 播放清單 ID
  playlistTitle?: string;       // 播放清單標題（快取用）
  playlistUrl?: string;         // 播放清單 URL
}

interface PlaylistInsertResult {
  playlistItemId: string;       // 新增的 playlistItem ID
  videoId: string;
  position: number;             // 在播放清單中的位置
}
```

### 5.2 核心功能

```
1. getPlaylistInfo(playlistId: string): Promise<PlaylistConfig>
   - 呼叫 YouTube Data API: GET playlists?part=snippet&id={playlistId}
   - 驗證播放清單存在且屬於當前使用者
   - 回傳播放清單標題和 URL

2. addVideoToPlaylist(videoId: string, playlistId: string): Promise<PlaylistInsertResult>
   - 呼叫 YouTube Data API: POST playlistItems?part=snippet
   - Body: {
       snippet: {
         playlistId: playlistId,
         resourceId: {
           kind: "youtube#video",
           videoId: videoId
         }
       }
     }
   - 新影片預設加到播放清單最後面

3. listUserPlaylists(): Promise<PlaylistConfig[]>
   - 呼叫 YouTube Data API: GET playlists?part=snippet&mine=true&maxResults=50
   - 供 --playlist list 指令列出可選的播放清單
```

### 5.3 錯誤處理

| 情境 | 處理 |
|------|------|
| 播放清單不存在 | 提示使用者確認 ID |
| 播放清單非自己所有 | 提示權限不足 |
| 播放清單已滿（5000 部上限） | 提示已達上限，影片仍上傳但不歸入清單 |
| 單一影片加入失敗 | 記錄 warning，繼續處理其他影片，最終報告中標記 |

---

## 六、Telegram 通知模組

### 6.1 架構說明

```
本模組不是 Telegram Bot 伺服器。
它只是一個「單向通知發送器」，利用 Telegram Bot API 的 sendMessage 端點，
在 CLI 任務完成後主動發送一則訊息給你。

你不需要:
- 在雲端跑 Bot 伺服器
- 設定 webhook 或 long polling
- 處理使用者訊息

你只需要:
- 一個 Telegram Bot Token（用來發送訊息的身份）
- 你自己的 Telegram Chat ID（訊息的接收對象）
```

### 6.2 前置設定

```
1. 在 Telegram 中找到 @BotFather，發送 /newbot 建立 Bot，取得 Bot Token
2. 找到 @userinfobot，發送任意訊息取得你的 Chat ID
3. ⚠️ 重要：先在 Telegram 中找到你剛建立的 Bot，對它發送 /start
   （Bot 必須先被你主動對話過，才能向你發送訊息）
4. 將 Token 和 Chat ID 填入 .env
```

### 6.3 模組：`telegram-notifier.ts`

```typescript
interface TelegramNotifyOptions {
  botToken: string;
  chatId: string;
}

interface NotifyPayload {
  samsungUrl: string;
  downloadedFiles: number;
  uploadedVideos: { title: string; url: string }[];
  playlistUrl?: string;
  failedItems?: { fileName: string; error: string }[];
  totalDuration: string;    // 如 "15 分 32 秒"
}
```

### 6.4 實作方式

```typescript
// 核心就是一個 HTTP POST 請求，不需要任何 Telegram SDK

async function sendTelegramNotification(options: TelegramNotifyOptions, payload: NotifyPayload): Promise<void> {
  const message = formatMessage(payload);  // 組裝通知文字

  const response = await fetch(
    `https://api.telegram.org/bot${options.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: options.chatId,
        text: message,
        parse_mode: 'HTML'       // 支援 <b>粗體</b> <a href="">連結</a> 等
      })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Telegram 通知發送失敗: ${error.description}`);
  }
}
```

### 6.5 通知訊息格式

```
成功時:
────────────────────
✅ Samsung Cloud → YouTube 完成

📥 下載: 4/4 成功
📤 上傳: 4/4 成功
📋 播放清單: 桌球練習紀錄

🎬 影片連結:
1. 影片1.mp4 → https://youtu.be/xxxxx
2. 影片2.mp4 → https://youtu.be/yyyyy
3. 影片3.mp4 → https://youtu.be/zzzzz
4. 影片4.mp4 → https://youtu.be/wwwww

📋 https://youtube.com/playlist?list=PLxxxxx
⏱ 耗時: 15 分 32 秒
────────────────────

部分失敗時:
────────────────────
⚠️ Samsung Cloud → YouTube 部分完成

📥 下載: 3/4 成功
📤 上傳: 3/3 成功

❌ 失敗:
• 影片3.mp4: 下載逾時

🎬 成功的影片:
1. 影片1.mp4 → https://youtu.be/xxxxx
2. 影片2.mp4 → https://youtu.be/yyyyy
4. 影片4.mp4 → https://youtu.be/wwwww

⏱ 耗時: 12 分 18 秒
────────────────────

完全失敗時:
────────────────────
❌ Samsung Cloud → YouTube 失敗

原因: 分享連結已過期
連結: https://quickshare.samsungcloud.com/74wr7EVRdGhV
────────────────────
```

### 6.6 錯誤處理

```
Telegram 通知是「附加功能」，通知失敗不應影響主流程。

- 若 .env 未設定 TELEGRAM_BOT_TOKEN 或 TELEGRAM_CHAT_ID → 跳過通知，僅 console 輸出
- 若 API 呼叫失敗 → console.warn 記錄，不拋出錯誤
- 若網路不通 → 3 秒 timeout，重試 1 次後放棄
```

---

## 七、CLI 入口模組

### 7.1 模組：`index.ts`

```
用法:
  npx tsx src/index.ts <samsung_share_url> [options]

參數:
  samsung_share_url       Samsung Cloud Quick Share 的完整 URL

選項:
  --download-only         只下載不上傳
  --upload-only <dir>     只上傳指定目錄中的影片
  --keep-files            上傳後不刪除本地檔案
  --title-prefix <str>    影片標題前綴
  --privacy <status>      private | unlisted | public (預設: private)
  --playlist <id>         上傳後加入指定的 YouTube 播放清單
  --playlist list         列出你的所有 YouTube 播放清單
  --no-notify             不發送 Telegram 通知
  --dry-run               僅列出檔案資訊，不實際執行
  --verbose               顯示詳細日誌
  --pin <code>            若分享連結有 PIN 碼保護，提供 6 位數 PIN

範例:
  # 基本使用：下載 + 上傳 + Telegram 通知
  npx tsx src/index.ts https://quickshare.samsungcloud.com/74wr7EVRdGhV

  # 指定標題前綴 + 加入播放清單
  npx tsx src/index.ts https://quickshare.samsungcloud.com/74wr7EVRdGhV --title-prefix "桌球練習" --playlist PLxxxxx

  # 只下載不上傳
  npx tsx src/index.ts https://quickshare.samsungcloud.com/74wr7EVRdGhV --download-only --keep-files

  # 查看有哪些播放清單可用
  npx tsx src/index.ts --playlist list

  # 首次 OAuth 授權
  npx tsx src/index.ts --auth
```

### 7.2 主流程

```
1. 解析命令列參數
2. 驗證 Samsung Cloud URL 格式 (regex: /^https:\/\/quickshare\.samsungcloud\.com\/[a-zA-Z0-9]+$/)
3. 檢查 Google OAuth 憑證是否存在
4. [下載階段]
   a. 初始化 Playwright browser
   b. 載入 Samsung Cloud 頁面
   c. 擷取檔案清單
   d. 篩選影片檔案（contentType 包含 'video'）
   e. 逐一下載至 downloads/ 目錄
   f. 顯示下載進度（cli-progress 進度條）
5. [上傳階段]
   a. 初始化 YouTube OAuth2 認證
   b. 逐一上傳影片至 YouTube（privacyStatus: 'private'）
   c. 顯示上傳進度
   d. 收集上傳結果
6. [播放清單階段]（若有指定 --playlist）
   a. 驗證播放清單存在
   b. 逐一將上傳成功的影片加入播放清單
7. [清理階段]
   a. 刪除 downloads/ 中的暫存檔案（除非 --keep-files）
8. [通知階段]
   a. 若有設定 Telegram 且未使用 --no-notify → 發送 Telegram 通知
   b. 無論如何都在 console 輸出完整報告
9. [報告]（console 輸出）
   a. 列出所有上傳成功的影片 ID 與 URL
   b. 列出播放清單連結
   c. 列出失敗的項目（若有）
   d. 總耗時
```

---

## 八、dependencies

### package.json

```json
{
  "name": "samsung-to-youtube",
  "version": "3.0.0",
  "description": "CLI 工具：自動從 Samsung Cloud Quick Share 下載影片並上傳至 YouTube 私人影片",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "auth": "tsx src/index.ts --auth"
  },
  "dependencies": {
    "playwright": "^1.49.0",
    "googleapis": "^144.0.0",
    "open": "^10.1.0",
    "cli-progress": "^3.12.0",
    "commander": "^12.1.0",
    "dotenv": "^16.4.0",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.0.0",
    "@types/cli-progress": "^3.11.0"
  }
}
```

### 核心依賴說明

| 套件 | 用途 |
|------|------|
| `playwright` | Headless 瀏覽器，載入 Samsung Cloud 頁面並擷取 JS 變數 |
| `googleapis` | Google 官方 SDK，處理 YouTube Data API v3 上傳 + 播放清單管理 |
| `open` | 首次 OAuth2 授權時開啟瀏覽器 |
| `cli-progress` | 下載/上傳進度條顯示 |
| `commander` | CLI 參數解析 |
| `dotenv` | 環境變數管理 |
| `chalk` | 終端彩色輸出 |
| `tsx` | 直接執行 TypeScript |

注意：Telegram 通知只用 Node.js 內建的 `fetch`（Node 18+），**不需要任何 Telegram SDK**。

---

## 九、環境變數 (.env)

```env
# ===== Telegram 通知（選填，不設定則跳過通知）=====
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...         # 從 @BotFather 取得
TELEGRAM_CHAT_ID=123456789                   # 從 @userinfobot 取得你的 Chat ID

# ===== Google OAuth =====
GOOGLE_CLIENT_SECRETS_PATH=./credentials/client_secrets.json
GOOGLE_TOKENS_PATH=./credentials/tokens.json
OAUTH_REDIRECT_PORT=3000

# ===== 下載設定 =====
DOWNLOAD_DIR=./downloads
DOWNLOAD_TIMEOUT=300000
DOWNLOAD_RETRY_COUNT=3

# ===== YouTube 上傳設定 =====
YOUTUBE_CATEGORY_ID=22
YOUTUBE_DEFAULT_PRIVACY=private
UPLOAD_CHUNK_SIZE=10485760

# ===== YouTube 播放清單（選填）=====
YOUTUBE_DEFAULT_PLAYLIST_ID=                 # 預設播放清單 ID，設定後不用每次加 --playlist

# ===== Playwright =====
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT=30000
```

---

## 十、首次使用流程

```
1. git clone <repo>
2. cd samsung-to-youtube
3. npm install
4. npx playwright install chromium

5. 設定 Google OAuth 憑證:
   a. 前往 https://console.cloud.google.com/
   b. 建立專案 → 啟用 YouTube Data API v3
   c. 建立 OAuth 2.0 憑證（桌面應用程式類型）
   d. OAuth 同意畫面 → 加入你自己為測試使用者
   e. 下載憑證 JSON → 存為 credentials/client_secrets.json

6. 設定環境變數:
   cp .env.example .env
   # 編輯 .env，填入設定

7. （選填）設定 Telegram 通知:
   a. 在 Telegram 找 @BotFather → /newbot → 取得 Token
   b. 找 @userinfobot → 取得你的 Chat ID
   c. 找到你新建的 Bot → 發送 /start（啟動對話）
   d. 將 Token 和 Chat ID 填入 .env

8. 首次 OAuth 授權:
   npx tsx src/index.ts --auth
   # 瀏覽器會開啟 Google 登入頁面，授權後 tokens.json 自動產生

9. 開始使用！
   npx tsx src/index.ts https://quickshare.samsungcloud.com/74wr7EVRdGhV
```

---

## 十一、安全注意事項

1. `credentials/` 目錄和 `.env` 必須加入 `.gitignore`，絕不能提交至版本控制
2. `tokens.json` 包含 refresh_token，等同帳號存取權限，需妥善保管
3. Telegram Bot Token 只用於單向發送通知給你自己，不會暴露在任何公開介面
4. 因為是本地執行，YouTube OAuth 金鑰只存在你自己的電腦上，不存在雲端洩漏的風險
5. Samsung Cloud 分享連結有時效性（通常幾天），過期後無法下載
6. YouTube API 每日配額有限（預設約 10,000 units，每次上傳消耗 1,600 units，playlistItems.insert 消耗 50 units），大量上傳需注意配額
7. 建議在 GCP Console 中設定 API 配額告警

---

## 十二、擴充方向（未來可選）

- 支援 Samsung Cloud 有密碼保護的連結（自動填入 PIN）
- 支援 LINE Notify 通知管道
- 支援依日期自動建立播放清單（如「2026-04 桌球」）
- 包裝成 npm global CLI 工具（`npm install -g samsung-to-youtube`），直接用 `s2yt <url>` 執行
- 加入 Web UI 介面（Express + React）方便非技術使用者操作
- 支援 Google Drive 備份（同時上傳至 YouTube 和 Google Drive）
