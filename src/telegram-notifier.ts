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
