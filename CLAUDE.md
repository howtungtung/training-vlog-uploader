# CLAUDE.md

## Project Overview

CLI tool that downloads videos from Samsung Cloud Quick Share and uploads them to YouTube. Written in TypeScript, runs with `tsx`.

## Commands

- `npm start -- <url> [options]` — Run the full pipeline
- `npm run auth` — OAuth2 authorization flow
- `npm test` — Run unit tests with vitest
- `npm run test:watch` — Watch mode tests
- `npm start -- --test-upload` — Integration test: download sample video + upload to YouTube (private)
- `npm start -- --test-notify` — Integration test: send test Telegram notification

## Architecture

- **Entry point**: `src/index.ts` — CLI via Commander.js
- **Modules**: Each file in `src/` is a single-responsibility module (download, upload, playlist, notify, auth, config, utils, errors)
- **ESM-only**: `"type": "module"` in package.json, all imports use `.js` extensions
- **Config**: Environment variables loaded via `dotenv`, parsed in `src/config.ts`

## Code Conventions

- TypeScript strict mode
- Target: ES2022, Module: ESNext, moduleResolution: bundler
- Use `node:` prefix for Node.js built-in imports (e.g., `node:fs`, `node:path`)
- Explicit interface definitions for module boundaries (exported types)
- Logging via `log()`, `logSuccess()`, `logWarn()`, `logError()` from `utils.ts` — these use chalk for colored output
- Custom errors in `src/errors.ts` (LinkExpiredError, LinkBlockedError, etc.)
- No classes for modules — use exported async functions

## Key Patterns

- Samsung download uses Playwright to extract `ShareLink.globals` from page context, then downloads via `fetch` with browser cookies
- YouTube upload uses `googleapis` SDK with resumable upload
- Telegram notification is a plain HTTP POST, no SDK — failures are non-fatal (warn and continue)
- Telegram sends per-video notification (via `sendTelegramText`) after each upload + a final summary (via `sendTelegramNotification`)
- Each video is added to the playlist immediately after upload via `onUploaded` callback in `uploadMultipleToYouTube`
- Download directory has a configurable max size (`DOWNLOAD_MAX_SIZE_MB`); oldest files are deleted when exceeded

## Testing

- Test framework: vitest
- Unit test files in `tests/` directory
- Integration tests via CLI flags (`--test-upload`, `--test-notify`) — require OAuth credentials and Telegram config respectively
- `--test-upload` downloads a ~770KB sample video (Big Buck Bunny) and uploads to YouTube as private, then cleans up
- `--test-notify` sends a mock success notification to Telegram with sample data

## Sensitive Files (never commit)

- `.env`
- `credentials/client_secrets.json`
- `credentials/tokens.json`
