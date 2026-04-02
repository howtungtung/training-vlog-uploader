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
