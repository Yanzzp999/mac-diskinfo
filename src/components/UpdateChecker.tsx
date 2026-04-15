import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpCircle, Download, ExternalLink, X, Loader2 } from 'lucide-react';
import type { UpdateInfo } from '../shared/types';

type CheckState = 'idle' | 'checking' | 'latest' | 'available' | 'error';

export function UpdateChecker() {
  const [state, setState] = useState<CheckState>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const check = useCallback(async () => {
    setState('checking');
    setError(null);
    try {
      const result = await window.electron.checkForUpdates();
      setInfo(result);
      setState(result.updateAvailable ? 'available' : 'latest');
      if (result.updateAvailable) setPopoverOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setState('error');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(check, 3000);
    return () => clearTimeout(timer);
  }, [check]);

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
    if (info?.releaseUrl) window.electron.openExternal(info.releaseUrl);
  }

  function handleDownload() {
    const url = info?.downloadUrl ?? info?.releaseUrl;
    if (url) window.electron.openExternal(url);
  }

  function formatDate(iso: string) {
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

  const hasBadge = state === 'available';

  return (
    <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        ref={buttonRef}
        onClick={() => {
          if (state === 'idle' || state === 'error') {
            void check();
          } else {
            setPopoverOpen((v) => !v);
          }
        }}
        className="relative p-1.5 rounded-md hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors group"
        title={
          state === 'checking'
            ? '正在检查更新…'
            : state === 'available'
              ? `新版本 v${info?.latestVersion} 可用`
              : state === 'latest'
                ? '已是最新版本'
                : state === 'error'
                  ? '检查更新失败，点击重试'
                  : '检查更新'
        }
      >
        {state === 'checking' ? (
          <Loader2 className="w-4 h-4 text-[#98989d] animate-spin" />
        ) : (
          <ArrowUpCircle
            className={`w-4 h-4 transition-colors ${
              hasBadge
                ? 'text-primary'
                : 'text-[#98989d] group-hover:text-[#f5f5f7]'
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
          className="absolute right-0 top-full mt-2 w-80 bg-surface border border-separator rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <h3 className="text-[13px] font-semibold text-[#f5f5f7]">
              软件更新
            </h3>
            <button
              onClick={() => setPopoverOpen(false)}
              className="p-0.5 rounded hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-3.5 h-3.5 text-[#98989d]" />
            </button>
          </div>

          {state === 'available' && info && (
            <div className="px-4 pb-4">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[20px] font-bold text-[#f5f5f7] tracking-tight">
                  v{info.latestVersion}
                </span>
                <span className="text-[11px] text-[#98989d] font-medium px-1.5 py-0.5 bg-primary/15 text-primary rounded-full">
                  新版本
                </span>
              </div>
              <p className="text-[12px] text-[#6e6e73] mb-3">
                发布于 {formatDate(info.publishedAt)} · 当前版本 v{info.currentVersion}
              </p>

              {info.releaseNotes && (
                <div className="mb-3 max-h-28 overflow-y-auto rounded-lg bg-background/60 p-2.5">
                  <p className="text-[12px] text-[#a1a1a6] leading-relaxed whitespace-pre-wrap">
                    {info.releaseNotes}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 active:bg-primary/80 text-white text-[13px] font-medium rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  下载更新
                </button>
                <button
                  onClick={handleOpenRelease}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.14] text-[#f5f5f7] text-[13px] font-medium rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  详情
                </button>
              </div>
            </div>
          )}

          {state === 'latest' && info && (
            <div className="px-4 pb-4">
              <div className="flex flex-col items-center py-3 text-center">
                <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center mb-2">
                  <ArrowUpCircle className="w-5 h-5 text-success" />
                </div>
                <p className="text-[13px] font-medium text-[#f5f5f7]">
                  已是最新版本
                </p>
                <p className="text-[12px] text-[#6e6e73] mt-0.5">
                  v{info.currentVersion}
                </p>
              </div>
              <button
                onClick={check}
                className="w-full px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.14] text-[#f5f5f7] text-[13px] font-medium rounded-lg transition-colors"
              >
                重新检查
              </button>
            </div>
          )}

          {state === 'error' && (
            <div className="px-4 pb-4">
              <div className="flex flex-col items-center py-3 text-center">
                <p className="text-[13px] text-[#ff453a] font-medium mb-1">
                  检查失败
                </p>
                <p className="text-[12px] text-[#6e6e73]">
                  {error ?? '无法连接到 GitHub'}
                </p>
              </div>
              <button
                onClick={check}
                className="w-full px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.14] text-[#f5f5f7] text-[13px] font-medium rounded-lg transition-colors"
              >
                重试
              </button>
            </div>
          )}

          {state === 'checking' && (
            <div className="px-4 pb-4">
              <div className="flex flex-col items-center py-4 text-center">
                <Loader2 className="w-6 h-6 text-primary animate-spin mb-2" />
                <p className="text-[13px] text-[#a1a1a6]">正在检查更新…</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
