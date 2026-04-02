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
      const delay = Math.pow(2, attempt) * 1000;
      logWarn(`Download failed, retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, delay));
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

    if (pin) {
      log('Entering PIN code...');
      await page.fill('#pinInput, input[name="pin"], input[type="password"]', pin);
      await page.click('#pinBtn, button[type="submit"]');
      await page.waitForTimeout(2000);
    }

    try {
      await page.waitForSelector('#downloadAllBtn', { timeout: config.playwright.timeout });
    } catch {
      logWarn('Page load timeout, retrying...');
      await page.reload({ waitUntil: 'networkidle', timeout: config.playwright.timeout });
      await page.waitForSelector('#downloadAllBtn', { timeout: config.playwright.timeout });
    }

    const shareData = await extractShareData(page);
    log(`Found ${shareData.contentsTotalCnt} file(s), uploadCompleted=${shareData.uploadCompleted}`);

    if (!shareData.uploadCompleted) {
      throw new Error('Samsung Cloud upload not yet completed for this link');
    }

    const videoContents = filterVideoContents(shareData.sharedatacontents);
    if (videoContents.length === 0) {
      logWarn('No video files found in this share link');
      return [];
    }

    log(`Found ${videoContents.length} video file(s) to download`);

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
