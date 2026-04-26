import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpCircle, Download, ExternalLink, X, Loader2 } from './MaterialIcons';
import type { UpdateState } from '../shared/types';

const INITIAL_UPDATE_STATE: UpdateState = {
  status: 'idle',
  info: null,
  progress: null,
  error: null,
};

export function UpdateChecker() {
  const [updateState, setUpdateState] = useState<UpdateState>(INITIAL_UPDATE_STATE);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const check = useCallback(async (openPopoverOnFailure = true) => {
    try {
      const result = await window.electron.checkForUpdates();
      setUpdateState(result);
      if (openPopoverOnFailure && result.status === 'error') {
        setPopoverOpen(true);
      }
    } catch (e) {
      setUpdateState((prev) => ({
        ...prev,
        status: 'error',
        error: e instanceof Error ? e.message : 'Unknown error',
      }));
      if (openPopoverOnFailure) {
        setPopoverOpen(true);
      }
    }
  }, []);

  const startDownload = useCallback(async () => {
    setPopoverOpen(true);

    if (updateState.info?.downloadMode === 'manual') {
      const url = updateState.info.downloadUrl ?? updateState.info.releaseUrl;
      if (url) {
        window.electron.openExternal(url);
      }
      return;
    }

    try {
      const result = await window.electron.downloadUpdate();
      setUpdateState(result);
    } catch (e) {
      setUpdateState((prev) => ({
        ...prev,
        status: 'error',
        error: e instanceof Error ? e.message : '下载更新失败',
      }));
    }
  }, [updateState.info]);

  const installDownloadedUpdate = useCallback(async () => {
    try {
      await window.electron.installUpdate();
    } catch (e) {
      setUpdateState((prev) => ({
        ...prev,
        status: 'error',
        error: e instanceof Error ? e.message : '安装更新失败',
      }));
      setPopoverOpen(true);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void check(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [check]);

  useEffect(() => {
    let cancelled = false;

    void window.electron
      .getUpdateState()
      .then((state) => {
        if (!cancelled) {
          setUpdateState(state);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setUpdateState((prev) => ({
            ...prev,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          }));
        }
      });

    const dispose = window.electron.onUpdateStateChange((state) => {
      setUpdateState(state);
    });

    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  useEffect(() => {
    if (
      updateState.status === 'available' ||
      updateState.status === 'downloaded'
    ) {
      setPopoverOpen(true);
    }
  }, [updateState.status]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false);
      }
    }
    if (popoverOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [popoverOpen]);

  function handleOpenRelease() {
    if (updateState.info?.releaseUrl) window.electron.openExternal(updateState.info.releaseUrl);
  }

  function formatDate(iso: string) {
    if (!iso) return '未知日期';

    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    const maximumFractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(maximumFractionDigits)} ${units[unitIndex]}`;
  }

  function getDisplayErrorMessage(message: string | null) {
    if (!message) return '无法连接到 GitHub';

    const normalized = message
      .replace(/^Error invoking remote method '.*?':\s*/i, '')
      .replace(/^Error:\s*/i, '');

    if (normalized.includes('latest-mac.yml')) {
      return '当前 GitHub Release 缺少自动更新文件，请先手动下载安装本次更新。';
    }

    return normalized;
  }

  const { status, info, progress, error } = updateState;
  const hasBadge = status === 'available' || status === 'downloaded';
  const progressPercent = Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0)));
  const releaseNotes = info?.releaseNotes.trim();
  const isManualDownloadOnly = info?.downloadMode === 'manual';
  const displayError = getDisplayErrorMessage(error);

  return (
    <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        ref={buttonRef}
        onClick={() => {
          if (status === 'idle') {
            void check();
          } else {
            setPopoverOpen((v) => !v);
          }
        }}
        className="relative p-1.5 rounded-md text-subtle hover:bg-control-hover hover:text-primary active:bg-primary-soft transition-colors"
        aria-label="检查更新"
        title={
          status === 'checking'
            ? '正在检查更新…'
            : status === 'downloading'
              ? `正在后台下载更新…${progressPercent}%`
              : status === 'downloaded'
                ? `新版本 v${info?.latestVersion} 已下载完成`
                : status === 'available'
              ? `新版本 v${info?.latestVersion} 可用`
              : status === 'latest'
                ? '已是最新版本'
                : status === 'error'
                  ? '更新检查暂时不可用，点击查看详情'
                  : '检查更新'
        }
      >
        {status === 'checking' || status === 'downloading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ArrowUpCircle
            className={`w-4 h-4 transition-colors ${
              hasBadge
                ? 'text-primary'
                : ''
            }`}
          />
        )}
        {hasBadge && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary ring-2 ring-sidebar/80" />
        )}
      </button>

      {popoverOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-80 bg-surface-raised border border-separator rounded-lg shadow-[var(--popover-shadow)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <h3 className="text-[13px] font-semibold text-foreground">
              软件更新
            </h3>
            <button
              onClick={() => setPopoverOpen(false)}
              className="p-0.5 rounded text-subtle hover:bg-control-hover hover:text-foreground transition-colors"
              aria-label="关闭更新弹窗"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {status === 'available' && info && (
            <div className="px-4 pb-4">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[20px] font-bold text-foreground">
                  v{info.latestVersion}
                </span>
                <span className="text-[11px] font-medium px-1.5 py-0.5 bg-primary-soft text-primary rounded-full border border-primary/20">
                  新版本
                </span>
              </div>
              <p className="text-[12px] text-muted mb-3">
                发布于 {formatDate(info.publishedAt)} · 当前版本 v{info.currentVersion}
              </p>

              {releaseNotes && (
                <div className="mb-3 max-h-28 overflow-y-auto rounded-lg bg-background p-2.5 border border-separator">
                  <p className="text-[12px] text-muted leading-relaxed whitespace-pre-wrap">
                    {releaseNotes}
                  </p>
                </div>
              )}

              <p className="text-[12px] text-muted mb-3">
                {info.availabilityMessage ?? '点击“立即更新”后会在后台下载，下载完成后会弹出安装提示。'}
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => void startDownload()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover active:bg-primary text-white text-[13px] font-medium rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isManualDownloadOnly ? '下载更新' : '立即更新'}
                </button>
                <button
                  onClick={handleOpenRelease}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-control hover:bg-control-hover active:bg-primary-soft text-foreground text-[13px] font-medium rounded-lg border border-separator transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  详情
                </button>
              </div>
            </div>
          )}

          {status === 'downloading' && info && (
            <div className="px-4 pb-4">
              <div className="mb-3">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[20px] font-bold text-foreground">
                    v{info.latestVersion}
                  </span>
                  <span className="text-[11px] text-muted font-medium px-1.5 py-0.5 bg-control border border-separator rounded-full">
                    正在下载
                  </span>
                </div>
                <p className="text-[12px] text-muted">
                  更新正在后台下载，你可以继续使用应用。
                </p>
              </div>

              <div className="rounded-lg bg-background p-3 border border-separator">
                <div className="flex items-center justify-between text-[12px] text-muted mb-2">
                  <span>下载进度</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-fill overflow-hidden">
                  <div
                    className="h-full bg-primary transition-[width] duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted mt-2">
                  <span>
                    {progress?.total
                      ? `${formatBytes(progress.transferred)} / ${formatBytes(progress.total)}`
                      : formatBytes(progress?.transferred ?? 0)}
                  </span>
                  <span>{formatBytes(progress?.bytesPerSecond ?? 0)}/s</span>
                </div>
              </div>
            </div>
          )}

          {status === 'downloaded' && info && (
            <div className="px-4 pb-4">
              <div className="flex flex-col items-center py-3 text-center">
                <div className="w-10 h-10 rounded-full bg-success-soft flex items-center justify-center mb-2 border border-success/20">
                  <Download className="w-5 h-5 text-success" />
                </div>
                <p className="text-[13px] font-medium text-foreground">
                  更新已下载完成
                </p>
                <p className="text-[12px] text-muted mt-0.5">
                  点击安装后会退出当前进程并更新到 v{info.latestVersion}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void installDownloadedUpdate()}
                  className="flex-1 px-3 py-1.5 bg-primary hover:bg-primary-hover active:bg-primary text-white text-[13px] font-medium rounded-lg transition-colors"
                >
                  安装并重启
                </button>
                <button
                  onClick={handleOpenRelease}
                  className="px-3 py-1.5 bg-control hover:bg-control-hover active:bg-primary-soft text-foreground text-[13px] font-medium rounded-lg border border-separator transition-colors"
                >
                  详情
                </button>
              </div>
            </div>
          )}

          {status === 'latest' && info && (
            <div className="px-4 pb-4">
              <div className="flex flex-col items-center py-3 text-center">
                <div className="w-10 h-10 rounded-full bg-success-soft flex items-center justify-center mb-2 border border-success/20">
                  <ArrowUpCircle className="w-5 h-5 text-success" />
                </div>
                <p className="text-[13px] font-medium text-foreground">
                  已是最新版本
                </p>
                <p className="text-[12px] text-muted mt-0.5">
                  v{info.currentVersion}
                </p>
              </div>
              <button
                onClick={() => void check(true)}
                className="w-full px-3 py-1.5 bg-control hover:bg-control-hover active:bg-primary-soft text-foreground text-[13px] font-medium rounded-lg border border-separator transition-colors"
              >
                重新检查
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="px-4 pb-4">
              <div className="flex flex-col items-center py-3 text-center">
                <p className="text-[13px] text-danger font-medium mb-1">
                  更新失败
                </p>
                <p className="text-[12px] text-muted">
                  {displayError}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void check(true)}
                  className="flex-1 px-3 py-1.5 bg-control hover:bg-control-hover active:bg-primary-soft text-foreground text-[13px] font-medium rounded-lg border border-separator transition-colors"
                >
                  重试
                </button>
                {info?.releaseUrl && (
                  <button
                    onClick={handleOpenRelease}
                    className="px-3 py-1.5 bg-control hover:bg-control-hover active:bg-primary-soft text-foreground text-[13px] font-medium rounded-lg border border-separator transition-colors"
                  >
                    详情
                  </button>
                )}
              </div>
            </div>
          )}

          {status === 'checking' && (
            <div className="px-4 pb-4">
              <div className="flex flex-col items-center py-4 text-center">
                <Loader2 className="w-6 h-6 text-primary animate-spin mb-2" />
                <p className="text-[13px] text-muted">正在检查更新…</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
