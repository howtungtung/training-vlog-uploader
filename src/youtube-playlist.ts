import { google } from 'googleapis';
import { log, logSuccess, logWarn, logError } from './utils.js';
import { getAuthClient } from './youtube-auth.js';
import type { AppConfig } from './config.js';

export interface PlaylistConfig {
  playlistId: string;
  playlistTitle?: string;
  playlistUrl?: string;
}

export interface PlaylistInsertResult {
  playlistItemId: string;
  videoId: string;
  position: number;
}

export async function getPlaylistInfo(
  playlistId: string,
  config: AppConfig,
): Promise<PlaylistConfig> {
  const auth = await getAuthClient(config);
  const youtube = google.youtube({ version: 'v3', auth });

  const response = await youtube.playlists.list({
    part: ['snippet'],
    id: [playlistId],
  });

  const playlist = response.data.items?.[0];
  if (!playlist) {
    throw new Error(`Playlist not found: ${playlistId}`);
  }

  return {
    playlistId,
    playlistTitle: playlist.snippet?.title ?? undefined,
    playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
  };
}

export async function addVideoToPlaylist(
  videoId: string,
  playlistId: string,
  config: AppConfig,
): Promise<PlaylistInsertResult> {
  const auth = await getAuthClient(config);
  const youtube = google.youtube({ version: 'v3', auth });

  const response = await youtube.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: {
          kind: 'youtube#video',
          videoId,
        },
      },
    },
  });

  const item = response.data;
  return {
    playlistItemId: item.id!,
    videoId,
    position: item.snippet?.position ?? 0,
  };
}

export async function addVideosToPlaylist(
  videoIds: string[],
  playlistId: string,
  config: AppConfig,
): Promise<{ succeeded: PlaylistInsertResult[]; failed: string[] }> {
  const succeeded: PlaylistInsertResult[] = [];
  const failed: string[] = [];

  for (const videoId of videoIds) {
    try {
      const result = await addVideoToPlaylist(videoId, playlistId, config);
      logSuccess(`Added to playlist: ${videoId} at position ${result.position}`);
      succeeded.push(result);
    } catch (err) {
      logWarn(`Failed to add ${videoId} to playlist: ${err instanceof Error ? err.message : err}`);
      failed.push(videoId);
    }
  }

  return { succeeded, failed };
}

export async function listUserPlaylists(config: AppConfig): Promise<PlaylistConfig[]> {
  const auth = await getAuthClient(config);
  const youtube = google.youtube({ version: 'v3', auth });

  const response = await youtube.playlists.list({
    part: ['snippet'],
    mine: true,
    maxResults: 50,
  });

  return (response.data.items ?? []).map((item) => ({
    playlistId: item.id!,
    playlistTitle: item.snippet?.title ?? undefined,
    playlistUrl: `https://www.youtube.com/playlist?list=${item.id}`,
  }));
}
