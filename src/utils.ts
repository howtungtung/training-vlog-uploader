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
  try {
    await fs.promises.access(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function enforceStorageLimit(dir: string, maxSizeMB: number): Promise<void> {
  if (maxSizeMB <= 0) return;

  const maxBytes = maxSizeMB * 1024 * 1024;
  const entries = await fs.promises.readdir(dir);

  const files: { name: string; path: string; size: number; mtimeMs: number }[] = [];
  for (const entry of entries) {
    if (entry === '.gitkeep') continue;
    const filePath = path.join(dir, entry);
    const stat = await fs.promises.stat(filePath);
    if (stat.isFile()) {
      files.push({ name: entry, path: filePath, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }

  let totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize <= maxBytes) return;

  // Sort oldest first
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);

  for (const file of files) {
    if (totalSize <= maxBytes) break;
    await fs.promises.unlink(file.path);
    totalSize -= file.size;
    logWarn(`Storage limit: deleted old file ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

export function generateDescription(samsungUrl: string): string {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `透過 Samsung Cloud Quick Share 自動上傳\n來源: ${samsungUrl}\n上傳時間: ${timestamp}`;
}
