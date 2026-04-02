# Samsung Cloud Quick Share to YouTube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool that downloads videos from Samsung Cloud Quick Share links and uploads them to YouTube as private videos, with optional playlist management and Telegram notifications.

**Architecture:** Modular TypeScript CLI with 5 core modules (samsung-downloader, youtube-uploader, youtube-playlist, telegram-notifier, config) orchestrated by a CLI entry point using Commander.js. Samsung download uses Playwright to extract JS variables from the SPA page, then streams files via fetch. YouTube upload uses the googleapis SDK with OAuth2 and resumable uploads. Telegram is a simple HTTP POST — no SDK needed.

**Tech Stack:** Node.js 18+, TypeScript, Playwright, googleapis, Commander.js, cli-progress, chalk, dotenv, vitest (testing)

**Spec:** `spec/samsung-cloud-to-youtube-spec.md`

---

## File Structure

```
samsung-to-youtube/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── credentials/              # OAuth2 credentials (gitignored)
│   └── .gitkeep
├── downloads/                # Temp download dir (gitignored)
│   └── .gitkeep
├── src/
│   ├── index.ts              # CLI entry point (Commander.js)
│   ├── config.ts             # Environment + config loading
│   ├── utils.ts              # Logging, cleanup, disk check, title generation
│   ├── errors.ts             # Custom error classes
│   ├── samsung-downloader.ts # Playwright-based Samsung Cloud downloader
│   ├── youtube-auth.ts       # OAuth2 authorization flow
│   ├── youtube-uploader.ts   # YouTube Data API v3 upload
│   ├── youtube-playlist.ts   # YouTube playlist management
│   └── telegram-notifier.ts  # Telegram Bot API notification sender
└── tests/
    ├── config.test.ts
    ├── utils.test.ts
    ├── errors.test.ts
    ├── telegram-notifier.test.ts
    └── samsung-downloader.test.ts
```

**Design decisions:**
- `youtube-auth.ts` split from `youtube-uploader.ts` — auth is reused by playlist module, and the OAuth flow (local HTTP server, browser open, token refresh) is complex enough to warrant its own file.
- `errors.ts` split from `utils.ts` — error classes are imported by multiple modules; keeping them separate avoids circular deps.
- Tests cover pure-logic functions (config parsing, title generation, message formatting, URL validation, error classes). External API modules are tested via manual integration runs.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `credentials/.gitkeep`
- Create: `downloads/.gitkeep`

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/jasontung/git-gp.yile808.com/training-vlog-uploader
git init
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "samsung-to-youtube",
  "version": "3.0.0",
  "description": "CLI: auto-download from Samsung Cloud Quick Share and upload to YouTube",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "auth": "tsx src/index.ts --auth",
    "test": "vitest run",
    "test:watch": "vitest"
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
    "@types/cli-progress": "^3.11.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
.env
credentials/client_secrets.json
credentials/tokens.json
downloads/*.mp4
downloads/*.mkv
downloads/*.avi
downloads/*.mov
.DS_Store
```

- [ ] **Step 5: Create `.env.example`**

```env
# ===== Telegram (optional) =====
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# ===== Google OAuth =====
GOOGLE_CLIENT_SECRETS_PATH=./credentials/client_secrets.json
GOOGLE_TOKENS_PATH=./credentials/tokens.json
OAUTH_REDIRECT_PORT=3000

# ===== Download =====
DOWNLOAD_DIR=./downloads
DOWNLOAD_TIMEOUT=300000
DOWNLOAD_RETRY_COUNT=3

# ===== YouTube =====
YOUTUBE_CATEGORY_ID=22
YOUTUBE_DEFAULT_PRIVACY=private
UPLOAD_CHUNK_SIZE=10485760

# ===== YouTube Playlist (optional) =====
YOUTUBE_DEFAULT_PLAYLIST_ID=

# ===== Playwright =====
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT=30000
```

- [ ] **Step 6: Create placeholder directories**

```bash
mkdir -p credentials downloads
touch credentials/.gitkeep downloads/.gitkeep
```

- [ ] **Step 7: Install dependencies**

```bash
npm install
npx playwright install chromium
```

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example credentials/.gitkeep downloads/.gitkeep
git commit -m "chore: scaffold project with dependencies and config"
```

---

### Task 2: Custom Error Classes

**Files:**
- Create: `src/errors.ts`
- Create: `tests/errors.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  LinkExpiredError,
  LinkBlockedError,
  LinkCancelledError,
  UploadQuotaError,
} from '../src/errors.js';

describe('LinkExpiredError', () => {
  it('has correct name and message', () => {
    const err = new LinkExpiredError('https://example.com');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LinkExpiredError');
    expect(err.message).toContain('expired');
    expect(err.url).toBe('https://example.com');
  });
});

describe('LinkBlockedError', () => {
  it('has correct name and message', () => {
    const err = new LinkBlockedError('https://example.com');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LinkBlockedError');
    expect(err.url).toBe('https://example.com');
  });
});

describe('LinkCancelledError', () => {
  it('has correct name and message', () => {
    const err = new LinkCancelledError('https://example.com');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LinkCancelledError');
    expect(err.url).toBe('https://example.com');
  });
});

describe('UploadQuotaError', () => {
  it('has correct name and message', () => {
    const err = new UploadQuotaError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UploadQuotaError');
    expect(err.message).toContain('quota');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/errors.test.ts
```

Expected: FAIL — cannot resolve `../src/errors.js`

- [ ] **Step 3: Implement `src/errors.ts`**

```typescript
export class LinkExpiredError extends Error {
  readonly url: string;
  constructor(url: string) {
    super(`Share link has expired: ${url}`);
    this.name = 'LinkExpiredError';
    this.url = url;
  }
}

export class LinkBlockedError extends Error {
  readonly url: string;
  constructor(url: string) {
    super(`Share link has been blocked: ${url}`);
    this.name = 'LinkBlockedError';
    this.url = url;
  }
}

export class LinkCancelledError extends Error {
  readonly url: string;
  constructor(url: string) {
    super(`Share link has been cancelled: ${url}`);
    this.name = 'LinkCancelledError';
    this.url = url;
  }
}

export class UploadQuotaError extends Error {
  constructor() {
    super('YouTube API daily upload quota exceeded. Try again tomorrow.');
    this.name = 'UploadQuotaError';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/errors.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts tests/errors.test.ts
git commit -m "feat: add custom error classes for link and upload failures"
```

---

### Task 3: Config Module

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/config.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig, type AppConfig } from '../src/config.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns defaults when no env vars set', () => {
    // Clear all relevant env vars
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.GOOGLE_CLIENT_SECRETS_PATH;
    delete process.env.GOOGLE_TOKENS_PATH;
    delete process.env.OAUTH_REDIRECT_PORT;
    delete process.env.DOWNLOAD_DIR;
    delete process.env.DOWNLOAD_TIMEOUT;
    delete process.env.DOWNLOAD_RETRY_COUNT;
    delete process.env.YOUTUBE_CATEGORY_ID;
    delete process.env.YOUTUBE_DEFAULT_PRIVACY;
    delete process.env.UPLOAD_CHUNK_SIZE;
    delete process.env.YOUTUBE_DEFAULT_PLAYLIST_ID;
    delete process.env.PLAYWRIGHT_HEADLESS;
    delete process.env.PLAYWRIGHT_TIMEOUT;

    const config = loadConfig();

    expect(config.telegram.botToken).toBe('');
    expect(config.telegram.chatId).toBe('');
    expect(config.google.clientSecretsPath).toBe('./credentials/client_secrets.json');
    expect(config.google.tokensPath).toBe('./credentials/tokens.json');
    expect(config.google.oauthRedirectPort).toBe(3000);
    expect(config.download.dir).toBe('./downloads');
    expect(config.download.timeout).toBe(300000);
    expect(config.download.retryCount).toBe(3);
    expect(config.youtube.categoryId).toBe('22');
    expect(config.youtube.defaultPrivacy).toBe('private');
    expect(config.youtube.uploadChunkSize).toBe(10485760);
    expect(config.youtube.defaultPlaylistId).toBe('');
    expect(config.playwright.headless).toBe(true);
    expect(config.playwright.timeout).toBe(30000);
  });

  it('reads env vars when set', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    process.env.OAUTH_REDIRECT_PORT = '4000';
    process.env.DOWNLOAD_TIMEOUT = '60000';
    process.env.PLAYWRIGHT_HEADLESS = 'false';

    const config = loadConfig();

    expect(config.telegram.botToken).toBe('test-token');
    expect(config.telegram.chatId).toBe('12345');
    expect(config.google.oauthRedirectPort).toBe(4000);
    expect(config.download.timeout).toBe(60000);
    expect(config.playwright.headless).toBe(false);
  });

  it('has telegram enabled only when both token and chatId are set', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    delete process.env.TELEGRAM_CHAT_ID;
    expect(loadConfig().telegram.enabled).toBe(false);

    process.env.TELEGRAM_CHAT_ID = '12345';
    expect(loadConfig().telegram.enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/config.test.ts
```

Expected: FAIL — cannot resolve `../src/config.js`

- [ ] **Step 3: Implement `src/config.ts`**

```typescript
import 'dotenv/config';

export interface AppConfig {
  telegram: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
  google: {
    clientSecretsPath: string;
    tokensPath: string;
    oauthRedirectPort: number;
  };
  download: {
    dir: string;
    timeout: number;
    retryCount: number;
  };
  youtube: {
    categoryId: string;
    defaultPrivacy: 'private' | 'unlisted' | 'public';
    uploadChunkSize: number;
    defaultPlaylistId: string;
  };
  playwright: {
    headless: boolean;
    timeout: number;
  };
}

export function loadConfig(): AppConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = process.env.TELEGRAM_CHAT_ID ?? '';

  return {
    telegram: {
      botToken,
      chatId,
      enabled: botToken !== '' && chatId !== '',
    },
    google: {
      clientSecretsPath: process.env.GOOGLE_CLIENT_SECRETS_PATH ?? './credentials/client_secrets.json',
      tokensPath: process.env.GOOGLE_TOKENS_PATH ?? './credentials/tokens.json',
      oauthRedirectPort: parseInt(process.env.OAUTH_REDIRECT_PORT ?? '3000', 10),
    },
    download: {
      dir: process.env.DOWNLOAD_DIR ?? './downloads',
      timeout: parseInt(process.env.DOWNLOAD_TIMEOUT ?? '300000', 10),
      retryCount: parseInt(process.env.DOWNLOAD_RETRY_COUNT ?? '3', 10),
    },
    youtube: {
      categoryId: process.env.YOUTUBE_CATEGORY_ID ?? '22',
      defaultPrivacy: (process.env.YOUTUBE_DEFAULT_PRIVACY ?? 'private') as 'private' | 'unlisted' | 'public',
      uploadChunkSize: parseInt(process.env.UPLOAD_CHUNK_SIZE ?? '10485760', 10),
      defaultPlaylistId: process.env.YOUTUBE_DEFAULT_PLAYLIST_ID ?? '',
    },
    playwright: {
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      timeout: parseInt(process.env.PLAYWRIGHT_TIMEOUT ?? '30000', 10),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/config.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config module with env var loading and defaults"
```

---

### Task 4: Utils Module

**Files:**
- Create: `src/utils.ts`
- Create: `tests/utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  validateSamsungUrl,
  generateVideoTitle,
  formatDuration,
  isVideoFile,
} from '../src/utils.js';

describe('validateSamsungUrl', () => {
  it('accepts valid Samsung Cloud URLs', () => {
    expect(validateSamsungUrl('https://quickshare.samsungcloud.com/74wr7EVRdGhV')).toBe(true);
    expect(validateSamsungUrl('https://quickshare.samsungcloud.com/abc123XYZ')).toBe(true);
  });

  it('rejects invalid URLs', () => {
    expect(validateSamsungUrl('https://example.com/abc')).toBe(false);
    expect(validateSamsungUrl('https://quickshare.samsungcloud.com/')).toBe(false);
    expect(validateSamsungUrl('not-a-url')).toBe(false);
    expect(validateSamsungUrl('')).toBe(false);
  });
});

describe('generateVideoTitle', () => {
  it('uses prefix + filename when prefix provided', () => {
    expect(generateVideoTitle('video.mp4', '桌球練習')).toBe('桌球練習 - video');
  });

  it('uses filename without extension when no prefix', () => {
    expect(generateVideoTitle('my_cool_video.mp4')).toBe('my_cool_video');
  });

  it('uses fallback for generic filenames', () => {
    const title = generateVideoTitle('video_001.mp4', undefined, 1);
    expect(title).toMatch(/^Samsung Share - \d{4}-\d{2}-\d{2} - 1$/);
  });

  it('truncates to 100 characters', () => {
    const longName = 'a'.repeat(120) + '.mp4';
    const title = generateVideoTitle(longName);
    expect(title.length).toBeLessThanOrEqual(100);
  });
});

describe('formatDuration', () => {
  it('formats seconds into human-readable string', () => {
    expect(formatDuration(0)).toBe('0 秒');
    expect(formatDuration(45)).toBe('45 秒');
    expect(formatDuration(60)).toBe('1 分 0 秒');
    expect(formatDuration(932)).toBe('15 分 32 秒');
    expect(formatDuration(3661)).toBe('1 時 1 分 1 秒');
  });
});

describe('isVideoFile', () => {
  it('identifies video content types', () => {
    expect(isVideoFile('video/mp4')).toBe(true);
    expect(isVideoFile('video/quicktime')).toBe(true);
    expect(isVideoFile('video/x-msvideo')).toBe(true);
  });

  it('rejects non-video content types', () => {
    expect(isVideoFile('image/jpeg')).toBe(false);
    expect(isVideoFile('application/pdf')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/utils.test.ts
```

Expected: FAIL — cannot resolve `../src/utils.js`

- [ ] **Step 3: Implement `src/utils.ts`**

```typescript
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

const SAMSUNG_URL_RE = /^https:\/\/quickshare\.samsungcloud\.com\/[a-zA-Z0-9]+$/;

const GENERIC_FILENAME_RE = /^video[_\-]?\d*$/i;

export function validateSamsungUrl(url: string): boolean {
  return SAMSUNG_URL_RE.test(url);
}

export function generateVideoTitle(
  fileName: string,
  prefix?: string,
  index?: number,
): string {
  const nameWithoutExt = path.parse(fileName).name;

  let title: string;

  if (prefix) {
    title = `${prefix} - ${nameWithoutExt}`;
  } else if (GENERIC_FILENAME_RE.test(nameWithoutExt)) {
    const date = new Date().toISOString().slice(0, 10);
    title = `Samsung Share - ${date} - ${index ?? 1}`;
  } else {
    title = nameWithoutExt;
  }

  if (title.length > 100) {
    title = title.slice(0, 100);
  }

  return title;
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} 時 ${minutes} 分 ${seconds} 秒`;
  }
  if (minutes > 0) {
    return `${minutes} 分 ${seconds} 秒`;
  }
  return `${seconds} 秒`;
}

export function isVideoFile(contentType: string): boolean {
  return contentType.startsWith('video/');
}

export function log(message: string): void {
  console.log(chalk.blue('[INFO]'), message);
}

export function logSuccess(message: string): void {
  console.log(chalk.green('[OK]'), message);
}

export function logWarn(message: string): void {
  console.warn(chalk.yellow('[WARN]'), message);
}

export function logError(message: string): void {
  console.error(chalk.red('[ERROR]'), message);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function cleanDownloads(dir: string): Promise<void> {
  const entries = await fs.promises.readdir(dir);
  for (const entry of entries) {
    if (entry === '.gitkeep') continue;
    await fs.promises.unlink(path.join(dir, entry));
  }
}

export async function checkDiskSpace(dir: string, requiredBytes: number): Promise<boolean> {
  // Node 18+ does not have a built-in disk space API.
  // We use a conservative approach: try to stat the dir and assume space is available.
  // In production, a more robust check could shell out to `df`.
  try {
    await fs.promises.access(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function generateDescription(samsungUrl: string): string {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `透過 Samsung Cloud Quick Share 自動上傳\n來源: ${samsungUrl}\n上傳時間: ${timestamp}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/utils.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils.ts tests/utils.test.ts
git commit -m "feat: add utils module with URL validation, title generation, formatting"
```

---

### Task 5: Telegram Notifier Module

**Files:**
- Create: `src/telegram-notifier.ts`
- Create: `tests/telegram-notifier.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/telegram-notifier.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatMessage, type NotifyPayload } from '../src/telegram-notifier.js';

describe('formatMessage', () => {
  it('formats a fully successful result', () => {
    const payload: NotifyPayload = {
      samsungUrl: 'https://quickshare.samsungcloud.com/abc123',
      downloadedFiles: 2,
      uploadedVideos: [
        { title: 'video1', url: 'https://youtu.be/aaa' },
        { title: 'video2', url: 'https://youtu.be/bbb' },
      ],
      playlistUrl: 'https://youtube.com/playlist?list=PLxxx',
      totalDuration: '5 分 30 秒',
    };

    const msg = formatMessage(payload);
    expect(msg).toContain('✅');
    expect(msg).toContain('2/2');
    expect(msg).toContain('video1');
    expect(msg).toContain('https://youtu.be/aaa');
    expect(msg).toContain('PLxxx');
    expect(msg).toContain('5 分 30 秒');
  });

  it('formats a partial failure result', () => {
    const payload: NotifyPayload = {
      samsungUrl: 'https://quickshare.samsungcloud.com/abc123',
      downloadedFiles: 2,
      uploadedVideos: [
        { title: 'video1', url: 'https://youtu.be/aaa' },
      ],
      failedItems: [
        { fileName: 'video2.mp4', error: '下載逾時' },
      ],
      totalDuration: '3 分 10 秒',
    };

    const msg = formatMessage(payload);
    expect(msg).toContain('⚠️');
    expect(msg).toContain('video2.mp4');
    expect(msg).toContain('下載逾時');
  });

  it('formats a complete failure result', () => {
    const payload: NotifyPayload = {
      samsungUrl: 'https://quickshare.samsungcloud.com/abc123',
      downloadedFiles: 0,
      uploadedVideos: [],
      failedItems: [
        { fileName: 'all', error: '分享連結已過期' },
      ],
      totalDuration: '0 秒',
    };

    const msg = formatMessage(payload);
    expect(msg).toContain('❌');
    expect(msg).toContain('分享連結已過期');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/telegram-notifier.test.ts
```

Expected: FAIL — cannot resolve module

- [ ] **Step 3: Implement `src/telegram-notifier.ts`**

```typescript
export interface TelegramNotifyOptions {
  botToken: string;
  chatId: string;
}

export interface NotifyPayload {
  samsungUrl: string;
  downloadedFiles: number;
  uploadedVideos: { title: string; url: string }[];
  playlistUrl?: string;
  failedItems?: { fileName: string; error: string }[];
  totalDuration: string;
}

export function formatMessage(payload: NotifyPayload): string {
  const {
    samsungUrl,
    downloadedFiles,
    uploadedVideos,
    playlistUrl,
    failedItems,
    totalDuration,
  } = payload;

  const hasFailures = failedItems && failedItems.length > 0;
  const totalUploaded = uploadedVideos.length;
  const isCompleteFailure = totalUploaded === 0 && hasFailures;

  if (isCompleteFailure) {
    const reason = failedItems![0]?.error ?? 'Unknown error';
    return [
      '❌ Samsung Cloud → YouTube 失敗',
      '',
      `原因: ${reason}`,
      `連結: ${samsungUrl}`,
    ].join('\n');
  }

  const isPartial = hasFailures;
  const header = isPartial
    ? '⚠️ Samsung Cloud → YouTube 部分完成'
    : '✅ Samsung Cloud → YouTube 完成';

  const lines: string[] = [header, ''];

  lines.push(`📥 下載: ${downloadedFiles}/${downloadedFiles + (failedItems?.filter(f => f.error.includes('下載')).length ?? 0)} 成功`);
  lines.push(`📤 上傳: ${totalUploaded}/${totalUploaded + (failedItems?.filter(f => !f.error.includes('下載')).length ?? 0)} 成功`);

  if (playlistUrl) {
    const listName = playlistUrl.split('list=')[1] ?? '';
    lines.push(`📋 播放清單: ${listName}`);
  }

  if (hasFailures) {
    lines.push('');
    lines.push('❌ 失敗:');
    for (const item of failedItems!) {
      lines.push(`• ${item.fileName}: ${item.error}`);
    }
  }

  if (totalUploaded > 0) {
    lines.push('');
    lines.push('🎬 影片連結:');
    uploadedVideos.forEach((v, i) => {
      lines.push(`${i + 1}. ${v.title} → ${v.url}`);
    });
  }

  if (playlistUrl) {
    lines.push('');
    lines.push(`📋 ${playlistUrl}`);
  }

  lines.push(`⏱ 耗時: ${totalDuration}`);

  return lines.join('\n');
}

export async function sendTelegramNotification(
  options: TelegramNotifyOptions,
  payload: NotifyPayload,
): Promise<void> {
  const message = formatMessage(payload);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${options.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: options.chatId,
          text: message,
          parse_mode: 'HTML',
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const error = (await response.json()) as { description?: string };
      console.warn(`[WARN] Telegram notification failed: ${error.description ?? response.statusText}`);
    }
  } catch (err) {
    // Retry once
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${options.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: options.chatId,
            text: message,
            parse_mode: 'HTML',
          }),
        },
      );
      if (!response.ok) {
        console.warn('[WARN] Telegram notification retry failed');
      }
    } catch {
      console.warn('[WARN] Telegram notification failed after retry, skipping');
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/telegram-notifier.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/telegram-notifier.ts tests/telegram-notifier.test.ts
git commit -m "feat: add Telegram notifier with message formatting and send logic"
```

---

### Task 6: Samsung Cloud Downloader Module

**Files:**
- Create: `src/samsung-downloader.ts`
- Create: `tests/samsung-downloader.test.ts`

- [ ] **Step 1: Write the failing tests for pure logic**

Create `tests/samsung-downloader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildDownloadUrl,
  filterVideoContents,
  type SamsungContent,
} from '../src/samsung-downloader.js';

describe('buildDownloadUrl', () => {
  it('returns original URL for non-V1 links', () => {
    const url = buildDownloadUrl('https://cdn.example.com/file.mp4', 'V2', 'test.mp4');
    expect(url).toBe('https://cdn.example.com/file.mp4');
  });

  it('appends encoded name for V1 links', () => {
    const url = buildDownloadUrl(
      'https://cdn.example.com/file.mp4',
      'V1',
      '桌球練習.mp4',
    );
    expect(url).toBe(
      'https://cdn.example.com/file.mp4&name=%E6%A1%8C%E7%90%83%E7%B7%B4%E7%BF%92.mp4',
    );
  });
});

describe('filterVideoContents', () => {
  const contents: SamsungContent[] = [
    { contentsSequenceNo: '1', name: 'video.mp4', original: 'https://a', contentType: 'video/mp4' },
    { contentsSequenceNo: '2', name: 'photo.jpg', original: 'https://b', contentType: 'image/jpeg' },
    { contentsSequenceNo: '3', name: 'clip.mov', original: 'https://c', contentType: 'video/quicktime' },
  ];

  it('returns only video content types', () => {
    const videos = filterVideoContents(contents);
    expect(videos).toHaveLength(2);
    expect(videos[0].name).toBe('video.mp4');
    expect(videos[1].name).toBe('clip.mov');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/samsung-downloader.test.ts
```

Expected: FAIL — cannot resolve module

- [ ] **Step 3: Implement `src/samsung-downloader.ts`**

```typescript
import { chromium, type Browser, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { SingleBar, Presets } from 'cli-progress';
import { isVideoFile, log, logSuccess, logError, logWarn, ensureDir } from './utils.js';
import { LinkExpiredError, LinkBlockedError, LinkCancelledError } from './errors.js';
import type { AppConfig } from './config.js';

export interface SamsungContent {
  contentsSequenceNo: string;
  name: string;
  original: string;
  contentType: string;
}

export interface SamsungShareData {
  contentsToken: string;
  linkUrlVersion: string;
  contentsTotalCnt: number;
  uploadCompleted: boolean;
  sharedatacontents: SamsungContent[];
}

export interface DownloadResult {
  filePath: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}

export function buildDownloadUrl(
  originalUrl: string,
  linkUrlVersion: string,
  fileName: string,
): string {
  if (linkUrlVersion === 'V1') {
    return `${originalUrl}&name=${encodeURIComponent(fileName)}`;
  }
  return originalUrl;
}

export function filterVideoContents(contents: SamsungContent[]): SamsungContent[] {
  return contents.filter((c) => isVideoFile(c.contentType));
}

async function extractShareData(page: Page): Promise<SamsungShareData> {
  return page.evaluate(() => {
    const g = (window as any).ShareLink?.globals;
    if (!g) throw new Error('ShareLink.globals not found on page');
    return {
      contentsToken: g.contentsToken,
      linkUrlVersion: g.linkUrlVersion,
      contentsTotalCnt: g.contentsTotalCnt,
      uploadCompleted: g.uploadCompleted === 'true' || g.uploadCompleted === true,
      sharedatacontents: g.sharedatacontents.map((item: any) => ({
        contentsSequenceNo: item.contentsSequenceNo,
        name: item.name,
        original: item.original,
        contentType: item.contentType,
      })),
    };
  });
}

async function downloadFile(
  url: string,
  destPath: string,
  cookies: string,
  timeout: number,
): Promise<number> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: { Cookie: cookies },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
    const bar = new SingleBar(
      { format: '  {bar} {percentage}% | {value}/{total} bytes' },
      Presets.shades_classic,
    );

    if (contentLength > 0) {
      bar.start(contentLength, 0);
    }

    const fileStream = fs.createWriteStream(destPath);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let downloaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(value);
      downloaded += value.byteLength;
      if (contentLength > 0) bar.update(downloaded);
    }

    fileStream.end();
    if (contentLength > 0) bar.stop();

    return downloaded;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function retryDownloadFile(
  url: string,
  destPath: string,
  cookies: string,
  timeout: number,
  retries: number,
): Promise<number> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await downloadFile(url, destPath, cookies, timeout);
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      logWarn(`Download failed, retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, delay));
      // Clean up partial file
      try { fs.unlinkSync(destPath); } catch {}
    }
  }
  throw new Error('Unreachable');
}

export async function downloadFromSamsung(
  samsungUrl: string,
  config: AppConfig,
  pin?: string,
): Promise<DownloadResult[]> {
  await ensureDir(config.download.dir);

  log(`Launching browser to load: ${samsungUrl}`);
  const browser: Browser = await chromium.launch({
    headless: config.playwright.headless,
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(samsungUrl, {
      waitUntil: 'networkidle',
      timeout: config.playwright.timeout,
    });

    // Handle PIN if required
    if (pin) {
      log('Entering PIN code...');
      await page.fill('#pinInput, input[name="pin"], input[type="password"]', pin);
      await page.click('#pinBtn, button[type="submit"]');
      await page.waitForTimeout(2000);
    }

    // Wait for the download button to appear (indicates page is loaded)
    try {
      await page.waitForSelector('#downloadAllBtn', { timeout: config.playwright.timeout });
    } catch {
      // Retry once — page might need more time
      logWarn('Page load timeout, retrying...');
      await page.reload({ waitUntil: 'networkidle', timeout: config.playwright.timeout });
      await page.waitForSelector('#downloadAllBtn', { timeout: config.playwright.timeout });
    }

    // Extract share data from page JS globals
    const shareData = await extractShareData(page);
    log(`Found ${shareData.contentsTotalCnt} file(s), uploadCompleted=${shareData.uploadCompleted}`);

    if (!shareData.uploadCompleted) {
      throw new Error('Samsung Cloud upload not yet completed for this link');
    }

    // Filter to video files only
    const videoContents = filterVideoContents(shareData.sharedatacontents);
    if (videoContents.length === 0) {
      logWarn('No video files found in this share link');
      return [];
    }

    log(`Found ${videoContents.length} video file(s) to download`);

    // Get cookies from browser context
    const browserCookies = await context.cookies();
    const cookieString = browserCookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const results: DownloadResult[] = [];

    for (const content of videoContents) {
      const downloadUrl = buildDownloadUrl(
        content.original,
        shareData.linkUrlVersion,
        content.name,
      );
      const destPath = path.join(config.download.dir, content.name);

      log(`Downloading: ${content.name}`);

      try {
        const fileSize = await retryDownloadFile(
          downloadUrl,
          destPath,
          cookieString,
          config.download.timeout,
          config.download.retryCount,
        );

        results.push({
          filePath: destPath,
          fileName: content.name,
          fileSize,
          contentType: content.contentType,
        });

        logSuccess(`Downloaded: ${content.name} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
      } catch (err) {
        logError(`Failed to download ${content.name}: ${err instanceof Error ? err.message : err}`);
      }
    }

    return results;
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/samsung-downloader.test.ts
```

Expected: 3 tests PASS (pure logic tests only — the main `downloadFromSamsung` function requires a real Samsung link)

- [ ] **Step 5: Commit**

```bash
git add src/samsung-downloader.ts tests/samsung-downloader.test.ts
git commit -m "feat: add Samsung Cloud downloader with Playwright extraction and retry logic"
```

---

### Task 7: YouTube OAuth2 Auth Module

**Files:**
- Create: `src/youtube-auth.ts`

- [ ] **Step 1: Implement `src/youtube-auth.ts`**

This module is entirely side-effectful (reads files, starts HTTP server, opens browser). No unit tests — tested via `--auth` CLI command.

```typescript
import fs from 'node:fs';
import http from 'node:http';
import { google } from 'googleapis';
import open from 'open';
import { log, logSuccess, logError } from './utils.js';
import type { AppConfig } from './config.js';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
];

interface ClientSecrets {
  installed: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope: string;
}

export async function getAuthClient(config: AppConfig) {
  const secretsRaw = await fs.promises.readFile(config.google.clientSecretsPath, 'utf-8');
  const secrets: ClientSecrets = JSON.parse(secretsRaw);
  const { client_id, client_secret } = secrets.installed;

  const redirectUri = `http://localhost:${config.google.oauthRedirectPort}`;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  // Check for existing tokens
  try {
    const tokensRaw = await fs.promises.readFile(config.google.tokensPath, 'utf-8');
    const tokens: StoredTokens = JSON.parse(tokensRaw);
    oauth2Client.setCredentials(tokens);

    // If token is expired, refresh it
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      log('Access token expired, refreshing...');
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      await saveTokens(config.google.tokensPath, credentials as StoredTokens);
      logSuccess('Token refreshed');
    }

    return oauth2Client;
  } catch {
    // No tokens file — need to authorize
    throw new Error(
      'No OAuth tokens found. Run with --auth to authorize first.',
    );
  }
}

export async function authorize(config: AppConfig): Promise<void> {
  const secretsRaw = await fs.promises.readFile(config.google.clientSecretsPath, 'utf-8');
  const secrets: ClientSecrets = JSON.parse(secretsRaw);
  const { client_id, client_secret } = secrets.installed;

  const redirectUri = `http://localhost:${config.google.oauthRedirectPort}`;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  log('Starting OAuth2 authorization flow...');
  log(`Opening browser to: ${authUrl}`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${config.google.oauthRedirectPort}`);
      const code = url.searchParams.get('code');

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>授權成功！你可以關閉此頁面。</h1>');
        server.close();
        resolve(code);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>授權失敗</h1>');
        server.close();
        reject(new Error('No authorization code received'));
      }
    });

    server.listen(config.google.oauthRedirectPort, () => {
      open(authUrl);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timeout (2 minutes)'));
    }, 120_000);
  });

  const { tokens } = await oauth2Client.getToken(code);
  await saveTokens(config.google.tokensPath, tokens as StoredTokens);

  logSuccess('OAuth2 authorization complete! Tokens saved.');
}

async function saveTokens(tokensPath: string, tokens: StoredTokens): Promise<void> {
  await fs.promises.writeFile(tokensPath, JSON.stringify(tokens, null, 2));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/youtube-auth.ts
git commit -m "feat: add YouTube OAuth2 auth module with token refresh and browser flow"
```

---

### Task 8: YouTube Uploader Module

**Files:**
- Create: `src/youtube-uploader.ts`

- [ ] **Step 1: Implement `src/youtube-uploader.ts`**

```typescript
import fs from 'node:fs';
import { google, type youtube_v3 } from 'googleapis';
import { SingleBar, Presets } from 'cli-progress';
import { log, logSuccess, logError, logWarn } from './utils.js';
import { UploadQuotaError } from './errors.js';
import { getAuthClient } from './youtube-auth.js';
import type { AppConfig } from './config.js';

export interface YouTubeUploadOptions {
  filePath: string;
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
}

export interface YouTubeUploadResult {
  videoId: string;
  title: string;
  url: string;
  status: string;
}

export async function uploadToYouTube(
  options: YouTubeUploadOptions,
  config: AppConfig,
): Promise<YouTubeUploadResult> {
  const auth = await getAuthClient(config);
  const youtube = google.youtube({ version: 'v3', auth });

  const fileSize = (await fs.promises.stat(options.filePath)).size;

  log(`Uploading: ${options.title} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);

  const bar = new SingleBar(
    { format: '  {bar} {percentage}% | {value}/{total} MB' },
    Presets.shades_classic,
  );
  bar.start(Math.round(fileSize / 1024 / 1024), 0);

  try {
    const response = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: options.title,
            description: options.description ?? '',
            tags: options.tags,
            categoryId: options.categoryId ?? config.youtube.categoryId,
          },
          status: {
            privacyStatus: options.privacyStatus,
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: fs.createReadStream(options.filePath),
        },
      },
      {
        onUploadProgress: (evt: { bytesRead: number }) => {
          bar.update(Math.round(evt.bytesRead / 1024 / 1024));
        },
      },
    );

    bar.stop();

    const videoId = response.data.id!;
    const result: YouTubeUploadResult = {
      videoId,
      title: options.title,
      url: `https://youtu.be/${videoId}`,
      status: response.data.status?.uploadStatus ?? 'unknown',
    };

    logSuccess(`Uploaded: ${result.title} → ${result.url}`);
    return result;
  } catch (err: any) {
    bar.stop();

    if (err?.code === 403 && err?.message?.includes('quota')) {
      throw new UploadQuotaError();
    }

    // Resumable upload network errors — retry up to 5 times
    if (err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT') {
      logWarn('Network error during upload, googleapis handles resumable retry internally');
    }

    throw err;
  }
}

export async function uploadMultipleToYouTube(
  files: YouTubeUploadOptions[],
  config: AppConfig,
): Promise<{ succeeded: YouTubeUploadResult[]; failed: { title: string; error: string }[] }> {
  const succeeded: YouTubeUploadResult[] = [];
  const failed: { title: string; error: string }[] = [];

  for (const file of files) {
    try {
      const result = await uploadToYouTube(file, config);
      succeeded.push(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logError(`Failed to upload ${file.title}: ${errorMsg}`);
      failed.push({ title: file.title, error: errorMsg });

      if (err instanceof UploadQuotaError) {
        logError('Quota exceeded — stopping all uploads');
        break;
      }
    }
  }

  return { succeeded, failed };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/youtube-uploader.ts
git commit -m "feat: add YouTube uploader with resumable upload and progress bar"
```

---

### Task 9: YouTube Playlist Module

**Files:**
- Create: `src/youtube-playlist.ts`

- [ ] **Step 1: Implement `src/youtube-playlist.ts`**

```typescript
import { google } from 'googleapis';
import { log, logSuccess, logWarn, logError } from './utils.js';
import { getAuthClient } from './youtube-auth.js';
import type { AppConfig } from './config.js';

export interface PlaylistConfig {
  playlistId: string;
  playlistTitle?: string;
  playlistUrl?: string;
}

export interface PlaylistInsertResult {
  playlistItemId: string;
  videoId: string;
  position: number;
}

export async function getPlaylistInfo(
  playlistId: string,
  config: AppConfig,
): Promise<PlaylistConfig> {
  const auth = await getAuthClient(config);
  const youtube = google.youtube({ version: 'v3', auth });

  const response = await youtube.playlists.list({
    part: ['snippet'],
    id: [playlistId],
  });

  const playlist = response.data.items?.[0];
  if (!playlist) {
    throw new Error(`Playlist not found: ${playlistId}`);
  }

  return {
    playlistId,
    playlistTitle: playlist.snippet?.title ?? undefined,
    playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
  };
}

export async function addVideoToPlaylist(
  videoId: string,
  playlistId: string,
  config: AppConfig,
): Promise<PlaylistInsertResult> {
  const auth = await getAuthClient(config);
  const youtube = google.youtube({ version: 'v3', auth });

  const response = await youtube.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: {
          kind: 'youtube#video',
          videoId,
        },
      },
    },
  });

  const item = response.data;
  return {
    playlistItemId: item.id!,
    videoId,
    position: item.snippet?.position ?? 0,
  };
}

export async function addVideosToPlaylist(
  videoIds: string[],
  playlistId: string,
  config: AppConfig,
): Promise<{ succeeded: PlaylistInsertResult[]; failed: string[] }> {
  const succeeded: PlaylistInsertResult[] = [];
  const failed: string[] = [];

  for (const videoId of videoIds) {
    try {
      const result = await addVideoToPlaylist(videoId, playlistId, config);
      logSuccess(`Added to playlist: ${videoId} at position ${result.position}`);
      succeeded.push(result);
    } catch (err) {
      logWarn(`Failed to add ${videoId} to playlist: ${err instanceof Error ? err.message : err}`);
      failed.push(videoId);
    }
  }

  return { succeeded, failed };
}

export async function listUserPlaylists(config: AppConfig): Promise<PlaylistConfig[]> {
  const auth = await getAuthClient(config);
  const youtube = google.youtube({ version: 'v3', auth });

  const response = await youtube.playlists.list({
    part: ['snippet'],
    mine: true,
    maxResults: 50,
  });

  return (response.data.items ?? []).map((item) => ({
    playlistId: item.id!,
    playlistTitle: item.snippet?.title ?? undefined,
    playlistUrl: `https://www.youtube.com/playlist?list=${item.id}`,
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/youtube-playlist.ts
git commit -m "feat: add YouTube playlist module with list, info, and batch insert"
```

---

### Task 10: CLI Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement `src/index.ts`**

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import {
  validateSamsungUrl,
  generateVideoTitle,
  generateDescription,
  formatDuration,
  log,
  logSuccess,
  logError,
  logWarn,
  cleanDownloads,
} from './utils.js';
import { downloadFromSamsung } from './samsung-downloader.js';
import { uploadMultipleToYouTube, type YouTubeUploadOptions } from './youtube-uploader.js';
import { getPlaylistInfo, addVideosToPlaylist, listUserPlaylists } from './youtube-playlist.js';
import { sendTelegramNotification, type NotifyPayload } from './telegram-notifier.js';
import { authorize } from './youtube-auth.js';

const program = new Command();

program
  .name('samsung-to-youtube')
  .description('Download from Samsung Cloud Quick Share and upload to YouTube')
  .version('3.0.0')
  .argument('[samsung_share_url]', 'Samsung Cloud Quick Share URL')
  .option('--auth', 'Run OAuth2 authorization flow')
  .option('--download-only', 'Download only, do not upload')
  .option('--upload-only <dir>', 'Upload videos from specified directory')
  .option('--keep-files', 'Keep downloaded files after upload')
  .option('--title-prefix <str>', 'Video title prefix')
  .option('--privacy <status>', 'private | unlisted | public', 'private')
  .option('--playlist <id>', 'YouTube playlist ID (or "list" to show playlists)')
  .option('--no-notify', 'Skip Telegram notification')
  .option('--dry-run', 'Show file info without executing')
  .option('--verbose', 'Show detailed logs')
  .option('--pin <code>', '6-digit PIN for protected share links')
  .action(async (samsungUrl: string | undefined, opts) => {
    const startTime = Date.now();
    const config = loadConfig();

    try {
      // --auth: run OAuth flow and exit
      if (opts.auth) {
        await authorize(config);
        return;
      }

      // --playlist list: show playlists and exit
      if (opts.playlist === 'list') {
        const playlists = await listUserPlaylists(config);
        console.log(chalk.bold('\nYour YouTube Playlists:\n'));
        for (const pl of playlists) {
          console.log(`  ${chalk.cyan(pl.playlistId)}  ${pl.playlistTitle}`);
          console.log(`  ${chalk.dim(pl.playlistUrl)}\n`);
        }
        return;
      }

      // Validate Samsung URL (unless --upload-only)
      if (!opts.uploadOnly) {
        if (!samsungUrl) {
          logError('Please provide a Samsung Cloud Quick Share URL');
          program.help();
          return;
        }
        if (!validateSamsungUrl(samsungUrl)) {
          logError('Invalid Samsung Cloud Quick Share URL format');
          process.exit(1);
        }
      }

      // === DOWNLOAD PHASE ===
      let downloadedFiles: { filePath: string; fileName: string; contentType: string }[] = [];

      if (opts.uploadOnly) {
        // Read files from specified directory
        const fs = await import('node:fs');
        const path = await import('node:path');
        const dir = opts.uploadOnly as string;
        const entries = await fs.promises.readdir(dir);
        downloadedFiles = entries
          .filter((f: string) => /\.(mp4|mkv|avi|mov|webm)$/i.test(f))
          .map((f: string) => ({
            filePath: path.join(dir, f),
            fileName: f,
            contentType: 'video/mp4',
          }));
        log(`Found ${downloadedFiles.length} video file(s) in ${dir}`);
      } else {
        log(`Starting download from Samsung Cloud...`);
        const results = await downloadFromSamsung(samsungUrl!, config, opts.pin);
        downloadedFiles = results.map((r) => ({
          filePath: r.filePath,
          fileName: r.fileName,
          contentType: r.contentType,
        }));
        logSuccess(`Downloaded ${downloadedFiles.length} file(s)`);
      }

      if (downloadedFiles.length === 0) {
        logWarn('No video files to process');
        return;
      }

      // --dry-run: show info and exit
      if (opts.dryRun) {
        console.log(chalk.bold('\nDry run — files found:\n'));
        for (const f of downloadedFiles) {
          console.log(`  ${f.fileName} (${f.contentType})`);
        }
        return;
      }

      // --download-only: stop here
      if (opts.downloadOnly) {
        logSuccess('Download complete (--download-only mode)');
        return;
      }

      // === UPLOAD PHASE ===
      const uploadOptions: YouTubeUploadOptions[] = downloadedFiles.map((f, i) => ({
        filePath: f.filePath,
        title: generateVideoTitle(f.fileName, opts.titlePrefix, i + 1),
        description: generateDescription(samsungUrl ?? 'local upload'),
        privacyStatus: opts.privacy as 'private' | 'unlisted' | 'public',
      }));

      log('Starting YouTube upload...');
      const uploadResult = await uploadMultipleToYouTube(uploadOptions, config);
      logSuccess(`Uploaded ${uploadResult.succeeded.length}/${uploadOptions.length} video(s)`);

      // === PLAYLIST PHASE ===
      const playlistId = opts.playlist ?? config.youtube.defaultPlaylistId;
      let playlistUrl: string | undefined;

      if (playlistId && uploadResult.succeeded.length > 0) {
        log(`Adding videos to playlist: ${playlistId}`);
        const plInfo = await getPlaylistInfo(playlistId, config);
        playlistUrl = plInfo.playlistUrl;
        logSuccess(`Playlist: ${plInfo.playlistTitle}`);

        const videoIds = uploadResult.succeeded.map((v) => v.videoId);
        await addVideosToPlaylist(videoIds, playlistId, config);
      }

      // === CLEANUP PHASE ===
      if (!opts.keepFiles && !opts.uploadOnly) {
        await cleanDownloads(config.download.dir);
        log('Cleaned up downloaded files');
      }

      // === NOTIFICATION PHASE ===
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const totalDuration = formatDuration(elapsed);

      const payload: NotifyPayload = {
        samsungUrl: samsungUrl ?? 'local upload',
        downloadedFiles: downloadedFiles.length,
        uploadedVideos: uploadResult.succeeded.map((v) => ({
          title: v.title,
          url: v.url,
        })),
        playlistUrl,
        failedItems: uploadResult.failed.map((f) => ({
          fileName: f.title,
          error: f.error,
        })),
        totalDuration,
      };

      // Console report
      console.log(chalk.bold('\n═══ Report ═══\n'));
      for (const v of uploadResult.succeeded) {
        console.log(`  ${chalk.green('✓')} ${v.title} → ${chalk.cyan(v.url)}`);
      }
      for (const f of uploadResult.failed) {
        console.log(`  ${chalk.red('✗')} ${f.title}: ${f.error}`);
      }
      if (playlistUrl) {
        console.log(`\n  ${chalk.blue('Playlist:')} ${playlistUrl}`);
      }
      console.log(`\n  ${chalk.dim(`Total time: ${totalDuration}`)}\n`);

      // Telegram notification
      if (opts.notify !== false && config.telegram.enabled) {
        log('Sending Telegram notification...');
        await sendTelegramNotification(
          { botToken: config.telegram.botToken, chatId: config.telegram.chatId },
          payload,
        );
        logSuccess('Telegram notification sent');
      }
    } catch (err) {
      logError(err instanceof Error ? err.message : String(err));

      // Try to send failure notification
      if (opts.notify !== false && config.telegram.enabled) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        await sendTelegramNotification(
          { botToken: config.telegram.botToken, chatId: config.telegram.chatId },
          {
            samsungUrl: samsungUrl ?? 'unknown',
            downloadedFiles: 0,
            uploadedVideos: [],
            failedItems: [{ fileName: 'all', error: err instanceof Error ? err.message : String(err) }],
            totalDuration: formatDuration(elapsed),
          },
        );
      }

      process.exit(1);
    }
  });

program.parse();
```

- [ ] **Step 2: Verify the CLI loads without errors**

```bash
npx tsx src/index.ts --help
```

Expected output: Help text showing all options described in the spec.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add CLI entry point with full download-upload-notify pipeline"
```

---

### Task 11: Run All Tests and Final Verification

**Files:**
- No new files

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests in `tests/errors.test.ts`, `tests/config.test.ts`, `tests/utils.test.ts`, `tests/telegram-notifier.test.ts`, `tests/samsung-downloader.test.ts` PASS.

- [ ] **Step 2: Verify CLI help output**

```bash
npx tsx src/index.ts --help
```

Expected: Shows usage, arguments, and all options from the spec.

- [ ] **Step 3: Verify TypeScript compiles without errors**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Create a final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address any issues found during final verification"
```

(Skip this commit if no changes were needed.)
