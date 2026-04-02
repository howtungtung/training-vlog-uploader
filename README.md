# Samsung Cloud Quick Share to YouTube

CLI tool that automatically downloads videos from Samsung Cloud Quick Share links and uploads them to YouTube as private videos, optionally adding them to a playlist and sending a Telegram notification.

## Tech Stack

- **Runtime**: Node.js + TypeScript (via tsx)
- **Browser automation**: Playwright (headless Chromium)
- **YouTube**: Google APIs (YouTube Data API v3, OAuth2)
- **Notifications**: Telegram Bot API (HTTP only, no SDK)
- **CLI**: Commander.js

## Quick Start

```bash
# Install dependencies
npm install
npx playwright install chromium

# Set up Google OAuth credentials
# 1. Go to https://console.cloud.google.com/
# 2. Create a project and enable YouTube Data API v3
# 3. Create OAuth 2.0 credentials (Desktop app type)
# 4. Add yourself as a test user in OAuth consent screen
# 5. Download the JSON and save as credentials/client_secrets.json

# Set up environment
cp .env.example .env
# Edit .env with your settings

# First-time OAuth authorization
npm run auth

# Run
npm start -- https://quickshare.samsungcloud.com/<share_code>
```

## Usage

```
samsung-to-youtube [samsung_share_url] [options]

Options:
  --auth                  Run OAuth2 authorization flow
  --download-only         Download only, do not upload
  --upload-only <dir>     Upload videos from specified directory
  --keep-files            Keep downloaded files after upload
  --title-prefix <str>    Video title prefix
  --privacy <status>      private | unlisted | public (default: private)
  --playlist <id>         YouTube playlist ID (or "list" to show playlists)
  --no-notify             Skip Telegram notification
  --dry-run               Show file info without executing
  --verbose               Show detailed logs
  --pin <code>            6-digit PIN for protected share links
  --test-upload           Test YouTube upload with a small sample video
  --test-notify           Test Telegram notification with sample data
```

### Examples

```bash
# Basic: download + upload + notify
npm start -- https://quickshare.samsungcloud.com/74wr7EVRdGhV

# With title prefix and playlist
npm start -- https://quickshare.samsungcloud.com/74wr7EVRdGhV \
  --title-prefix "Table Tennis" --playlist PLxxxxx

# Download only
npm start -- https://quickshare.samsungcloud.com/74wr7EVRdGhV --download-only

# Upload local videos
npm start -- --upload-only ./my-videos

# List your playlists
npm start -- --playlist list
```

## Environment Variables

See [.env.example](.env.example) for all available settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | *(empty)* | Telegram Bot token (optional) |
| `TELEGRAM_CHAT_ID` | *(empty)* | Your Telegram chat ID (optional) |
| `GOOGLE_CLIENT_SECRETS_PATH` | `./credentials/client_secrets.json` | OAuth2 client secrets |
| `GOOGLE_TOKENS_PATH` | `./credentials/tokens.json` | OAuth2 tokens (auto-generated) |
| `DOWNLOAD_DIR` | `./downloads` | Local download directory |
| `DOWNLOAD_TIMEOUT` | `300000` | Download timeout (ms) |
| `DOWNLOAD_RETRY_COUNT` | `3` | Download retry attempts |
| `DOWNLOAD_MAX_SIZE_MB` | `5120` | Max download dir size (MB), 0 = unlimited |
| `YOUTUBE_CATEGORY_ID` | `22` | YouTube category (22 = People & Blogs) |
| `YOUTUBE_DEFAULT_PRIVACY` | `private` | Default upload privacy |
| `YOUTUBE_DEFAULT_PLAYLIST_ID` | *(empty)* | Default playlist ID |

## Telegram Notifications (Optional)

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. Get your chat ID from [@userinfobot](https://t.me/userinfobot)
3. Send `/start` to your new bot (required before it can message you)
4. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`

Notification behavior:

- **Per-video notification** — sent immediately after each video is uploaded (and added to playlist)
- **Final summary** — sent after all uploads complete, with full results and total time

## Project Structure

```
src/
  index.ts               # CLI entry point
  config.ts              # Configuration loader
  samsung-downloader.ts  # Samsung Cloud download via Playwright
  youtube-auth.ts        # Google OAuth2 flow
  youtube-uploader.ts    # YouTube resumable upload
  youtube-playlist.ts    # Playlist management
  telegram-notifier.ts   # Telegram notification sender
  utils.ts               # Helpers (logging, file ops, storage limit)
  errors.ts              # Custom error types
```

## Testing

```bash
npm test            # Run unit tests
npm run test:watch  # Watch mode

# Integration tests (require OAuth credentials)
npm start -- --test-upload    # Download sample video + upload to YouTube (private)
npm start -- --test-notify    # Send test Telegram notification
```

## Notes

- Each video is added to the playlist immediately after upload (not batched at the end)
- Samsung Cloud share links expire after a few days
- YouTube API has a daily quota (~10,000 units; each upload costs 1,600 units)
- `credentials/` and `.env` are gitignored and must never be committed
- The download directory is automatically cleaned after successful upload (use `--keep-files` to preserve)
- Storage limit enforcement deletes oldest files first when the download directory exceeds `DOWNLOAD_MAX_SIZE_MB`
