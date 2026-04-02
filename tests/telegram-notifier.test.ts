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
