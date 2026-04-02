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
