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
