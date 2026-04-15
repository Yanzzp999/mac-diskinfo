import { app, net } from 'electron';
import type { UpdateInfo } from '../../src/shared/types';

const GITHUB_OWNER = 'Yanzzp999';
const GITHUB_REPO = 'mac-diskinfo';
const API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

function parseVersion(tag: string): number[] {
  return tag.replace(/^v/, '').split('.').map(Number);
}

function isNewer(latest: number[], current: number[]): boolean {
  const len = Math.max(latest.length, current.length);
  for (let i = 0; i < len; i++) {
    const l = latest[i] ?? 0;
    const c = current[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion();

  const response = await net.fetch(API_URL, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': `${GITHUB_REPO}/${currentVersion}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
  }

  const release = (await response.json()) as {
    tag_name: string;
    html_url: string;
    body: string;
    published_at: string;
    assets: { name: string; browser_download_url: string }[];
  };

  const latestVersion = release.tag_name.replace(/^v/, '');
  const updateAvailable = isNewer(parseVersion(latestVersion), parseVersion(currentVersion));

  const dmgAsset = release.assets.find((a) => a.name.endsWith('.dmg'));

  return {
    updateAvailable,
    currentVersion,
    latestVersion,
    releaseUrl: release.html_url,
    downloadUrl: dmgAsset?.browser_download_url ?? null,
    releaseNotes: release.body ?? '',
    publishedAt: release.published_at,
  };
}
