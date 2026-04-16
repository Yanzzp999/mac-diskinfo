import { app, BrowserWindow, dialog, net } from 'electron';
import { EventEmitter } from 'node:events';
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo as ElectronUpdateInfo,
} from 'electron-updater';
import type {
  UpdateInfo as SharedUpdateInfo,
  UpdateProgress,
  UpdateState,
} from '../../src/shared/types';

const GITHUB_OWNER = 'Yanzzp999';
const GITHUB_REPO = 'mac-diskinfo';
const API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const UPDATE_STATE_CHANGE_EVENT = 'update-state-change';
const UPDATE_CHECK_DEDUPE_MS = 15_000;

type UpdateStateListener = (state: UpdateState) => void;

interface GithubReleaseResponse {
  tag_name: string;
  html_url: string;
  body: string;
  published_at: string;
  assets: { name: string; browser_download_url: string }[];
}

const updateEvents = new EventEmitter();

let currentState: UpdateState = {
  status: 'idle',
  info: null,
  progress: null,
  error: null,
};

let updaterConfigured = false;
let checkPromise: Promise<UpdateState> | null = null;
let downloadPromise: Promise<UpdateState> | null = null;
let promptedDownloadedVersion: string | null = null;
let downloadRequested = false;
let lastCheckFinishedAt = 0;

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

function cloneInfo(info: SharedUpdateInfo | null): SharedUpdateInfo | null {
  return info ? { ...info } : null;
}

function cloneProgress(progress: UpdateProgress | null): UpdateProgress | null {
  return progress ? { ...progress } : null;
}

function snapshotState(): UpdateState {
  return {
    status: currentState.status,
    info: cloneInfo(currentState.info),
    progress: cloneProgress(currentState.progress),
    error: currentState.error,
  };
}

function emitStateChange() {
  updateEvents.emit(UPDATE_STATE_CHANGE_EVENT, snapshotState());
}

function setState(next: Partial<UpdateState>) {
  currentState = {
    status: next.status ?? currentState.status,
    info: next.info === undefined ? currentState.info : cloneInfo(next.info),
    progress: next.progress === undefined ? currentState.progress : cloneProgress(next.progress),
    error: next.error === undefined ? currentState.error : next.error,
  };

  emitStateChange();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function extractGithubErrorMessage(rawText: string): string {
  const normalized = rawText.trim();
  if (!normalized) return '';

  try {
    const parsed = JSON.parse(normalized) as { message?: unknown };
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // Fall back to the raw response body when GitHub does not return JSON.
  }

  return normalized;
}

function buildReleaseUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${version}`;
}

function pickDownloadUrl(files: ElectronUpdateInfo['files']): string | null {
  const preferredFile =
    files.find((file) => file.url.endsWith('.zip')) ??
    files.find((file) => file.url.endsWith('.dmg')) ??
    files[0];

  return preferredFile?.url ?? null;
}

function normalizeReleaseNotes(releaseNotes: ElectronUpdateInfo['releaseNotes']): string {
  if (typeof releaseNotes === 'string') {
    return releaseNotes;
  }

  if (!releaseNotes?.length) {
    return '';
  }

  return releaseNotes
    .map((note) => {
      if (!note.note) return `v${note.version}`;
      return `v${note.version}\n${note.note}`;
    })
    .join('\n\n');
}

function buildFallbackInfo(currentVersion: string): SharedUpdateInfo {
  return {
    updateAvailable: false,
    currentVersion,
    latestVersion: currentVersion,
    releaseUrl: RELEASES_URL,
    downloadUrl: null,
    releaseNotes: '',
    publishedAt: '',
    downloadMode: 'manual',
    availabilityMessage: null,
  };
}

function mergeElectronUpdateInfo(
  existingInfo: SharedUpdateInfo | null,
  electronInfo: ElectronUpdateInfo,
  updateAvailable: boolean
): SharedUpdateInfo {
  const currentVersion = app.getVersion();
  const latestVersion = electronInfo.version.replace(/^v/, '');

  return {
    updateAvailable,
    currentVersion,
    latestVersion,
    releaseUrl: existingInfo?.releaseUrl ?? buildReleaseUrl(latestVersion),
    downloadUrl: existingInfo?.downloadUrl ?? pickDownloadUrl(electronInfo.files),
    releaseNotes: existingInfo?.releaseNotes || normalizeReleaseNotes(electronInfo.releaseNotes),
    publishedAt: existingInfo?.publishedAt ?? electronInfo.releaseDate,
    downloadMode: 'auto',
    availabilityMessage: null,
  };
}

function mapProgress(progress: ProgressInfo): UpdateProgress {
  return {
    percent: progress.percent,
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond,
  };
}

function createEmptyProgress(): UpdateProgress {
  return {
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
  };
}

async function fetchGithubReleaseInfo(): Promise<SharedUpdateInfo> {
  const currentVersion = app.getVersion();

  const response = await net.fetch(API_URL, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': `${GITHUB_REPO}/${currentVersion}`,
    },
  });

  if (!response.ok) {
    const details = extractGithubErrorMessage(await response.text());
    const suffix = details || response.statusText;
    throw new Error(`GitHub API returned ${response.status}: ${suffix}`);
  }

  const release = (await response.json()) as GithubReleaseResponse;
  const latestVersion = release.tag_name.replace(/^v/, '');
  const updateAvailable = isNewer(parseVersion(latestVersion), parseVersion(currentVersion));
  const preferredAsset =
    release.assets.find((asset) => asset.name.endsWith('.zip')) ??
    release.assets.find((asset) => asset.name.endsWith('.dmg'));

  return {
    updateAvailable,
    currentVersion,
    latestVersion,
    releaseUrl: release.html_url,
    downloadUrl: preferredAsset?.browser_download_url ?? null,
    releaseNotes: release.body ?? '',
    publishedAt: release.published_at,
    downloadMode: 'manual',
    availabilityMessage: null,
  };
}

function isMissingUpdateMetadataError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('latest-mac.yml') && (message.includes('404') || message.includes('cannot find'));
}

function isGithubApiForbiddenError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('github api returned 403');
}

function isGithubRateLimitError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return isGithubApiForbiddenError(error) && message.includes('rate limit');
}

function toManualDownloadInfo(info: SharedUpdateInfo): SharedUpdateInfo {
  return {
    ...info,
    downloadMode: 'manual',
    availabilityMessage: '当前 GitHub Release 缺少自动更新文件，这次需要手动下载安装。',
  };
}

function createUserFacingUpdateError(error: unknown) {
  if (isMissingUpdateMetadataError(error)) {
    return new Error('当前 GitHub Release 缺少自动更新文件，请先手动下载安装本次更新。');
  }

  if (isGithubRateLimitError(error)) {
    return new Error('GitHub 当前限制了匿名更新检查，请稍后重试，或打开发布页手动查看。');
  }

  if (isGithubApiForbiddenError(error)) {
    return new Error('GitHub 暂时拒绝了本次更新检查，请稍后重试，或打开发布页手动查看。');
  }

  return new Error(getErrorMessage(error));
}

async function promptToInstall(info: SharedUpdateInfo) {
  if (promptedDownloadedVersion === info.latestVersion) return;
  promptedDownloadedVersion = info.latestVersion;

  const options = {
    type: 'info' as const,
    buttons: ['安装并重启', '稍后'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    message: `mac-diskinfo v${info.latestVersion} 已下载完成`,
    detail: '点击“安装并重启”后，应用会退出当前进程并安装新版本。',
  };

  const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const result = targetWindow
    ? await dialog.showMessageBox(targetWindow, options)
    : await dialog.showMessageBox(options);

  if (result.response === 0) {
    installUpdate();
  }
}

function ensureUpdaterConfigured() {
  if (updaterConfigured || !app.isPackaged) return;

  updaterConfigured = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = {
    info: (message) => console.log(`[updater] ${message}`),
    warn: (message) => console.warn(`[updater] ${message}`),
    error: (message) => console.error(`[updater] ${message}`),
  };

  autoUpdater.on('checking-for-update', () => {
    setState({
      status: downloadRequested ? 'downloading' : 'checking',
      progress: downloadRequested ? currentState.progress ?? createEmptyProgress() : null,
      error: null,
    });
  });

  autoUpdater.on('update-available', (info) => {
    setState({
      status: downloadRequested ? 'downloading' : 'available',
      info: mergeElectronUpdateInfo(currentState.info, info, true),
      progress: downloadRequested ? currentState.progress ?? createEmptyProgress() : null,
      error: null,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    setState({
      status: 'latest',
      info: mergeElectronUpdateInfo(currentState.info, info, false),
      progress: null,
      error: null,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    setState({
      status: 'downloading',
      progress: mapProgress(progress),
      error: null,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
    downloadRequested = false;
    const mergedInfo = mergeElectronUpdateInfo(currentState.info, info, true);
    setState({
      status: 'downloaded',
      info: mergedInfo,
      progress: {
        percent: 100,
        transferred: currentState.progress?.total ?? currentState.progress?.transferred ?? 0,
        total: currentState.progress?.total ?? currentState.progress?.transferred ?? 0,
        bytesPerSecond: 0,
      },
      error: null,
    });

    void promptToInstall(mergedInfo);
  });

  autoUpdater.on('error', (error) => {
    downloadRequested = false;
    setState({
      status: 'error',
      error: getErrorMessage(error),
      progress: null,
    });
  });
}

export function getUpdateState(): UpdateState {
  return snapshotState();
}

export function onUpdateStateChange(listener: UpdateStateListener) {
  updateEvents.on(UPDATE_STATE_CHANGE_EVENT, listener);
  return () => {
    updateEvents.off(UPDATE_STATE_CHANGE_EVENT, listener);
  };
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (checkPromise) return checkPromise;

  const now = Date.now();
  if (currentState.status !== 'idle' && now - lastCheckFinishedAt < UPDATE_CHECK_DEDUPE_MS) {
    return snapshotState();
  }

  checkPromise = (async () => {
    const currentVersion = app.getVersion();

    if (!app.isPackaged) {
      setState({
        status: 'checking',
        progress: null,
        error: null,
      });

      try {
        const info = await fetchGithubReleaseInfo();
        setState({
          status: info.updateAvailable ? 'available' : 'latest',
          info,
          progress: null,
          error: null,
        });
        return snapshotState();
      } catch (error) {
        const userFacingError = createUserFacingUpdateError(error);
        setState({
          status: 'error',
          info: buildFallbackInfo(currentVersion),
          progress: null,
          error: userFacingError.message,
        });
        return snapshotState();
      }
    }

    ensureUpdaterConfigured();
    const releaseInfoPromise = fetchGithubReleaseInfo().catch(() => null);

    try {
      const result = await autoUpdater.checkForUpdates();
      const githubInfo = await releaseInfoPromise;

      if (!result) {
        setState({
          status: githubInfo?.updateAvailable ? 'available' : 'latest',
          info: githubInfo ?? buildFallbackInfo(currentVersion),
          progress: null,
          error: null,
        });
        return snapshotState();
      }

      setState({
        status: result.isUpdateAvailable ? 'available' : 'latest',
        info: mergeElectronUpdateInfo(githubInfo, result.updateInfo, result.isUpdateAvailable),
        progress: null,
        error: null,
      });

      return snapshotState();
    } catch (error) {
      const githubInfo = await releaseInfoPromise;

      if (githubInfo && isMissingUpdateMetadataError(error)) {
        setState({
          status: githubInfo.updateAvailable ? 'available' : 'latest',
          info: githubInfo.updateAvailable ? toManualDownloadInfo(githubInfo) : githubInfo,
          progress: null,
          error: null,
        });
        return snapshotState();
      }

      setState({
        status: 'error',
        info: githubInfo,
        progress: null,
        error: getErrorMessage(error),
      });
      throw createUserFacingUpdateError(error);
    }
  })().finally(() => {
    lastCheckFinishedAt = Date.now();
    checkPromise = null;
  });

  return checkPromise;
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!app.isPackaged) {
    const message = '自动下载安装仅在打包后的应用中可用。';
    setState({
      status: 'error',
      progress: null,
      error: message,
    });
    throw new Error(message);
  }

  if (downloadPromise) return downloadPromise;

  downloadPromise = (async () => {
    ensureUpdaterConfigured();
    downloadRequested = true;

    if (currentState.status === 'downloaded') {
      downloadRequested = false;
      return snapshotState();
    }

    if (currentState.info?.downloadMode === 'manual') {
      throw new Error('当前 GitHub Release 缺少自动更新文件，请打开发布页手动下载安装。');
    }

    setState({
      status: 'downloading',
      progress: currentState.progress ?? createEmptyProgress(),
      error: null,
    });

    const result = await autoUpdater.checkForUpdates();

    if (!result?.isUpdateAvailable) {
      setState({
        status: 'latest',
        info: result
          ? mergeElectronUpdateInfo(currentState.info, result.updateInfo, false)
          : currentState.info,
        progress: null,
        error: null,
      });

      return snapshotState();
    }

    setState({
      status: 'downloading',
      info: mergeElectronUpdateInfo(currentState.info, result.updateInfo, true),
      progress: currentState.progress ?? createEmptyProgress(),
      error: null,
    });

    await autoUpdater.downloadUpdate();
    return snapshotState();
  })()
    .catch((error) => {
      downloadRequested = false;
      setState({
        status: 'error',
        progress: null,
        error: getErrorMessage(error),
      });
      throw createUserFacingUpdateError(error);
    })
    .finally(() => {
      downloadRequested = false;
      downloadPromise = null;
    });

  return downloadPromise;
}

export function installUpdate() {
  if (!app.isPackaged) {
    throw new Error('自动安装仅在打包后的应用中可用。');
  }

  if (currentState.status !== 'downloaded') {
    throw new Error('更新尚未下载完成。');
  }

  autoUpdater.quitAndInstall();
}
