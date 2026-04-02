import 'dotenv/config';

export interface AppConfig {
  telegram: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
  google: {
    clientSecretsPath: string;
    tokensPath: string;
    oauthRedirectPort: number;
  };
  download: {
    dir: string;
    timeout: number;
    retryCount: number;
    maxSizeMB: number;
  };
  youtube: {
    categoryId: string;
    defaultPrivacy: 'private' | 'unlisted' | 'public';
    uploadChunkSize: number;
    defaultPlaylistId: string;
  };
  playwright: {
    headless: boolean;
    timeout: number;
  };
}

export function loadConfig(): AppConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = process.env.TELEGRAM_CHAT_ID ?? '';

  return {
    telegram: {
      botToken,
      chatId,
      enabled: botToken !== '' && chatId !== '',
    },
    google: {
      clientSecretsPath: process.env.GOOGLE_CLIENT_SECRETS_PATH ?? './credentials/client_secrets.json',
      tokensPath: process.env.GOOGLE_TOKENS_PATH ?? './credentials/tokens.json',
      oauthRedirectPort: parseInt(process.env.OAUTH_REDIRECT_PORT ?? '3000', 10),
    },
    download: {
      dir: process.env.DOWNLOAD_DIR ?? './downloads',
      timeout: parseInt(process.env.DOWNLOAD_TIMEOUT ?? '300000', 10),
      retryCount: parseInt(process.env.DOWNLOAD_RETRY_COUNT ?? '3', 10),
      maxSizeMB: parseInt(process.env.DOWNLOAD_MAX_SIZE_MB ?? '5120', 10),
    },
    youtube: {
      categoryId: process.env.YOUTUBE_CATEGORY_ID ?? '22',
      defaultPrivacy: (process.env.YOUTUBE_DEFAULT_PRIVACY ?? 'private') as 'private' | 'unlisted' | 'public',
      uploadChunkSize: parseInt(process.env.UPLOAD_CHUNK_SIZE ?? '10485760', 10),
      defaultPlaylistId: process.env.YOUTUBE_DEFAULT_PLAYLIST_ID ?? '',
    },
    playwright: {
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      timeout: parseInt(process.env.PLAYWRIGHT_TIMEOUT ?? '30000', 10),
    },
  };
}
