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
