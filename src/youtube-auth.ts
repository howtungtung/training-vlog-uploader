import fs from 'node:fs';
import http from 'node:http';
import { google } from 'googleapis';
import open from 'open';
import { log, logSuccess, logError } from './utils.js';
import type { AppConfig } from './config.js';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
];

interface ClientSecrets {
  installed: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope: string;
}

export async function getAuthClient(config: AppConfig) {
  const secretsRaw = await fs.promises.readFile(config.google.clientSecretsPath, 'utf-8');
  const secrets: ClientSecrets = JSON.parse(secretsRaw);
  const { client_id, client_secret } = secrets.installed;

  const redirectUri = `http://localhost:${config.google.oauthRedirectPort}`;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  try {
    const tokensRaw = await fs.promises.readFile(config.google.tokensPath, 'utf-8');
    const tokens: StoredTokens = JSON.parse(tokensRaw);
    oauth2Client.setCredentials(tokens);

    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      log('Access token expired, refreshing...');
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      await saveTokens(config.google.tokensPath, credentials as StoredTokens);
      logSuccess('Token refreshed');
    }

    return oauth2Client;
  } catch {
    throw new Error(
      'No OAuth tokens found. Run with --auth to authorize first.',
    );
  }
}

export async function authorize(config: AppConfig): Promise<void> {
  const secretsRaw = await fs.promises.readFile(config.google.clientSecretsPath, 'utf-8');
  const secrets: ClientSecrets = JSON.parse(secretsRaw);
  const { client_id, client_secret } = secrets.installed;

  const redirectUri = `http://localhost:${config.google.oauthRedirectPort}`;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  log('Starting OAuth2 authorization flow...');
  log(`Opening browser to: ${authUrl}`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${config.google.oauthRedirectPort}`);
      const code = url.searchParams.get('code');

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>授權成功！你可以關閉此頁面。</h1>');
        server.close();
        resolve(code);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>授權失敗</h1>');
        server.close();
        reject(new Error('No authorization code received'));
      }
    });

    server.listen(config.google.oauthRedirectPort, () => {
      open(authUrl);
    });

    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timeout (2 minutes)'));
    }, 120_000);
  });

  const { tokens } = await oauth2Client.getToken(code);
  await saveTokens(config.google.tokensPath, tokens as StoredTokens);

  logSuccess('OAuth2 authorization complete! Tokens saved.');
}

async function saveTokens(tokensPath: string, tokens: StoredTokens): Promise<void> {
  await fs.promises.writeFile(tokensPath, JSON.stringify(tokens, null, 2));
}
