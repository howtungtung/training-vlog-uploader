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
