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
