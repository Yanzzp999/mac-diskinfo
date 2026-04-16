import type { DiskDevice, DiskSpeedData, SmartAttribute, SmartReport } from '../shared/types';
import { MetricCard } from './MetricCard';
import { StatusBadge } from './StatusBadge';
import { Thermometer, Activity, Clock, AlertTriangle, Database, Zap, HeartPulse, HardDrive, Shield, TriangleAlert, X, Cable } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import hddImg from '../assets/hdd-flat.svg';
import ssdImg from '../assets/ssd-flat.svg';
import nvmeImg from '../assets/nvme-flat.svg';
import { useState, useEffect, useRef } from 'react';

interface SmartDetailProps {
  device: DiskDevice;
  report: SmartReport | null;
  loading: boolean;
}

interface SpeedSample {
  timestamp: number;
  readSpeed: number;
  writeSpeed: number;
  readEma: number;
  writeEma: number;
}

const speedHistoryCache = new Map<string, SpeedSample[]>();

const SPEED_SAMPLE_MS = 2_000;
const SPEED_WINDOW_MS = 60_000;
const SPEED_WINDOW_SECONDS = SPEED_WINDOW_MS / 1_000;
const EMA_ALPHA = 0.35;
const INITIAL_Y_AXIS_MAX_MB = 8;
const MIN_Y_AXIS_MAX_MB = 1;
const Y_AXIS_PADDING = 1.15;

function formatRate(valueMB: number) {
  if (valueMB >= 1024) return `${(valueMB / 1024).toFixed(valueMB >= 10_240 ? 0 : 1)} GB/s`;
  if (valueMB >= 1) return `${valueMB.toFixed(valueMB >= 10 ? 0 : 1)} MB/s`;

  const valueKB = valueMB * 1024;
  if (valueKB >= 1) return `${valueKB.toFixed(valueKB >= 10 ? 0 : 1)} KB/s`;

  return `${Math.round(valueKB * 1024)} B/s`;
}

function formatTimeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
  });
}

function clampAxisMax(valueMB: number) {
  const nextValue = Math.max(valueMB, MIN_Y_AXIS_MAX_MB);

  if (nextValue >= 100) return Math.ceil(nextValue / 10) * 10;
  if (nextValue >= 10) return Math.ceil(nextValue);
  if (nextValue >= 1) return Math.ceil(nextValue * 2) / 2;
  return Math.ceil(nextValue * 10) / 10;
}

function getCachedSpeedHistory(bsdName: string) {
  const cutoff = Date.now() - SPEED_WINDOW_MS;
  const cached = speedHistoryCache.get(bsdName) ?? [];
  const filtered = cached.filter((sample) => sample.timestamp >= cutoff);

  if (filtered.length !== cached.length) {
    if (filtered.length > 0) {
      speedHistoryCache.set(bsdName, filtered);
    } else {
      speedHistoryCache.delete(bsdName);
    }
  }

  return filtered;
}

function getSmartHints(device: DiskDevice) {
  return {
    transport: device.transport,
    isInternal: device.isInternal,
    bridgeChip: device.bridgeChip,
    connectionPath: device.connectionPath,
  };
}

function formatBlockSize(bytes?: number) {
  if (bytes === undefined) return 'N/A';
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(bytes % 1024 === 0 ? 0 : 1)} KB`;
  return `${bytes} B`;
}

function formatAttributeName(name: string) {
  return name.replace(/_/g, ' ');
}

function getAtaHealthAssessment(report: SmartReport) {
  if (report.healthPassed === false) {
    return {
      label: 'Bad',
      accentClass: 'text-[#ff453a]',
      panelClass: 'border-[#ff453a]/20 bg-[#ff453a]/8',
      summary: 'SMART self-assessment failed. Back up this drive as soon as possible.',
    };
  }

  const cautionReasons: string[] = [];
  if ((report.reallocatedSectors ?? 0) > 0) cautionReasons.push('reallocated sectors');
  if ((report.currentPendingSectors ?? 0) > 0) cautionReasons.push('pending sectors');
  if ((report.offlineUncorrectable ?? 0) > 0) cautionReasons.push('uncorrectable sectors');

  if (cautionReasons.length > 0) {
    return {
      label: 'Caution',
      accentClass: 'text-[#ff9f0a]',
      panelClass: 'border-[#ff9f0a]/20 bg-[#ff9f0a]/8',
      summary: `Surface warning: ${cautionReasons.join(', ')} detected.`,
    };
  }

  if ((report.udmaCrcErrors ?? 0) > 0) {
    return {
      label: 'Attention',
      accentClass: 'text-[#64d2ff]',
      panelClass: 'border-[#64d2ff]/20 bg-[#64d2ff]/8',
      summary: 'Disk surface looks healthy, but the link has recorded CRC/interface errors.',
    };
  }

  return {
    label: 'Good',
    accentClass: 'text-[#32d74b]',
    panelClass: 'border-[#32d74b]/20 bg-[#32d74b]/8',
    summary: 'No critical HDD SMART warning attributes are currently elevated.',
  };
}

function getHealthAssessment(report: SmartReport) {
  if (report.protocol === 'nvme') {
    if (report.healthPassed === false) {
      return {
        label: 'Bad',
        accentClass: 'text-[#ff453a]',
        panelClass: 'border-[#ff453a]/20 bg-[#ff453a]/8',
        summary: 'NVMe health check failed. Back up this drive immediately.',
      };
    }
    const cautionReasons: string[] = [];
    if ((report.mediaErrors ?? 0) > 0) cautionReasons.push('media errors');
    if ((report.percentageUsed ?? 0) >= 90) cautionReasons.push('high wear level');
    if ((report.availableSpare ?? 100) <= 10) cautionReasons.push('low spare capacity');
    if (cautionReasons.length > 0) {
      return {
        label: 'Caution',
        accentClass: 'text-[#ff9f0a]',
        panelClass: 'border-[#ff9f0a]/20 bg-[#ff9f0a]/8',
        summary: `Warning: ${cautionReasons.join(', ')} detected.`,
      };
    }
    return {
      label: 'Good',
      accentClass: 'text-[#32d74b]',
      panelClass: 'border-[#32d74b]/20 bg-[#32d74b]/8',
      summary: 'NVMe drive is operating normally with no critical warnings.',
    };
  }
  return getAtaHealthAssessment(report);
}

type AttributeHealthStatus = 'ok' | 'warning' | 'danger';

const CRITICAL_SURFACE_IDS = new Set([5, 196, 197, 198]);

function getAttributeHealthStatus(attr: SmartAttribute): AttributeHealthStatus {
  if (attr.value !== undefined && attr.threshold !== undefined && attr.threshold > 0 && attr.value <= attr.threshold) {
    return 'danger';
  }
  if (CRITICAL_SURFACE_IDS.has(attr.id) && (attr.rawValue ?? 0) > 0) {
    return 'warning';
  }
  if (attr.id === 199 && (attr.rawValue ?? 0) > 0) {
    return 'warning';
  }
  return 'ok';
}

const ATTRIBUTE_ROW_CLASSES: Record<AttributeHealthStatus, string> = {
  ok: '',
  warning: 'bg-[#ff9f0a]/[0.06]',
  danger: 'bg-[#ff453a]/[0.08]',
};

const ATTRIBUTE_DOT_CLASSES: Record<AttributeHealthStatus, string> = {
  ok: 'bg-[#32d74b]',
  warning: 'bg-[#ff9f0a]',
  danger: 'bg-[#ff453a]',
};

const KEY_ATTRIBUTE_IDS = new Set([1, 3, 4, 5, 7, 9, 10, 12, 177, 187, 188, 193, 194, 196, 197, 198, 199, 233, 241, 242]);

function getDisplayedAttributes(report: SmartReport, showAll: boolean) {
  const all = [...(report.rawAttributes ?? [])].sort((a, b) => a.id - b.id);
  if (showAll) return all;
  return all.filter(attr => KEY_ATTRIBUTE_IDS.has(attr.id) || getAttributeHealthStatus(attr) !== 'ok');
}

function getSmartUnavailableHint(device: DiskDevice, report: SmartReport) {
  const failureReason = report.failureReason?.toLowerCase() ?? '';
  const hintText = `${device.transport} ${device.bridgeChip ?? ''} ${device.connectionPath ?? ''}`.toLowerCase();
  const isExternalLike = !device.isInternal || hintText.includes('usb') || hintText.includes('thunderbolt');

  if (failureReason.includes('smartctl was not found') || failureReason.includes('command not found')) {
    return 'smartctl 没有被应用找到。通常是没有安装 smartmontools，或打包应用拿不到 Homebrew 路径。';
  }

  if (failureReason.includes('iocreateplugininterfaceforservice failed')) {
    return isExternalLike
      ? '这类设备常见于盒子不支持 SMART 透传，或 macOS 没有把底层 SMART 接口暴露给 smartctl。'
      : 'macOS 可能没有把这块内置盘的 SMART 接口暴露给 smartctl，所以即使命令存在也读不到。';
  }

  if (isExternalLike) {
    return '这类问题在 USB / Thunderbolt 外置硬盘盒上很常见，外壳桥接芯片可能不支持 SMART 透传。';
  }

  return '当前系统没有成功返回这块盘的 SMART 原始信息。';
}

export function SmartDetail({ device, report, loading }: SmartDetailProps) {
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [liveTemp, setLiveTemp] = useState<number | null>(null);
  const [isWindowFocused, setIsWindowFocused] = useState(() => document.hasFocus());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [speedHistory, setSpeedHistory] = useState<SpeedSample[]>(() => getCachedSpeedHistory(device.bsdName));
  const [showEma, setShowEma] = useState(false);
  const [showAllAttributes, setShowAllAttributes] = useState(false);
  const [chartSeedTime] = useState(() => Date.now());
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleFocus = () => {
      setIsWindowFocused(true);
    };

    const handleBlur = () => {
      setIsWindowFocused(false);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    const element = chartContainerRef.current;
    if (!element) return;

    const syncChartSize = () => {
      const width = Math.max(0, Math.floor(element.clientWidth));
      const height = Math.max(0, Math.floor(element.clientHeight));

      setChartSize((prev) => (
        prev.width === width && prev.height === height
          ? prev
          : { width, height }
      ));
    };

    syncChartSize();

    const observer = new ResizeObserver(() => {
      syncChartSize();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Poll temperature every 5s for SMART-capable disks
  useEffect(() => {
    // Clear previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only poll if the report is readable and the window is active.
    if (!report?.readable || !isWindowFocused) return;

    const fetchTemperature = async () => {
      try {
        const temp = await window.electron.getTemperature(device.id, getSmartHints(device));
        if (temp !== null) setLiveTemp(temp);
      } catch {
        // Ignore transient SMART polling failures.
      }
    };

    // Start polling
    void fetchTemperature();
    intervalRef.current = setInterval(() => {
      void fetchTemperature();
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [device, isWindowFocused, report?.readable]);

  // Disk Speed Monitoring
  useEffect(() => {
    const handleSpeedUpdate = (data: DiskSpeedData) => {
      if (data.bsdName !== device.bsdName) return;

      const readMB = data.readSpeedBytes / (1024 * 1024);
      const writeMB = data.writeSpeedBytes / (1024 * 1024);

      setSpeedHistory(prev => {
        const previousSample = prev[prev.length - 1];
        const nextSample: SpeedSample = {
          timestamp: data.timestamp,
          readSpeed: readMB,
          writeSpeed: writeMB,
          readEma: previousSample ? previousSample.readEma + EMA_ALPHA * (readMB - previousSample.readEma) : readMB,
          writeEma: previousSample ? previousSample.writeEma + EMA_ALPHA * (writeMB - previousSample.writeEma) : writeMB,
        };

        const cutoff = data.timestamp - SPEED_WINDOW_MS;
        const nextHistory = [...prev.filter(sample => sample.timestamp >= cutoff), nextSample];
        speedHistoryCache.set(device.bsdName, nextHistory);
        return nextHistory;
      });
    };

    const unsubscribe = window.electron.onDiskSpeedUpdate(handleSpeedUpdate);
    window.electron.startDiskSpeedMonitor(device.bsdName);

    return () => {
      unsubscribe();
      window.electron.stopDiskSpeedMonitor(device.bsdName);
    };
  }, [device.bsdName]);

  const currentTemp = liveTemp ?? report?.temperatureC;
  const latestSample = speedHistory.length > 0 ? speedHistory[speedHistory.length - 1] : null;
  const peakRead = speedHistory.reduce((maxValue, sample) => Math.max(maxValue, sample.readSpeed), 0);
  const peakWrite = speedHistory.reduce((maxValue, sample) => Math.max(maxValue, sample.writeSpeed), 0);
  const observedMax = speedHistory.reduce(
    (maxValue, sample) => Math.max(maxValue, sample.readSpeed, sample.writeSpeed),
    0
  );
  const yAxisMax = speedHistory.length === 0
    ? INITIAL_Y_AXIS_MAX_MB
    : clampAxisMax(observedMax * Y_AXIS_PADDING);
  const chartEnd = latestSample?.timestamp ?? chartSeedTime;
  const chartStart = chartEnd - SPEED_WINDOW_MS;
  const canRenderSpeedChart = chartSize.width > 0 && chartSize.height > 0;

  const isNVMe = device.transport.toUpperCase().includes('NVME') || device.transport.toUpperCase().includes('FABRIC') || device.transport.toUpperCase().includes('PCI');
  const diskType = device.isSolidState === false ? 'HDD' : (isNVMe ? 'NVMe' : 'SSD');
  const isAta = report?.protocol === 'ata';
  const isAtaHdd = isAta && diskType === 'HDD';
  const health = report?.readable ? getHealthAssessment(report) : null;
  const displayedAttributes = report ? getDisplayedAttributes(report, showAllAttributes) : [];

  let TransportImg = ssdImg;
  if (diskType === 'HDD') TransportImg = hddImg;
  else if (diskType === 'NVMe') TransportImg = nvmeImg;

  const formatSize = (bytes: number) => {
    const gb = bytes / (1000 * 1000 * 1000);
    return gb >= 1000 ? `${(gb / 1000).toFixed(2)} TB` : `${gb.toFixed(0)} GB`;
  };

  const formatUnits = (units?: number) => {
    if (units === undefined) return 'N/A';
    const bytes = units * 1000 * 512;
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1000) return `${(gb / 1024).toFixed(2)} TB`;
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <div className="h-full min-w-0 overflow-y-auto p-6 space-y-5">
      {/* Device Header */}
      <div className="flex items-center gap-5 pb-5 border-b border-separator">
        <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-[#3a3a3c]">
          <img src={TransportImg} alt={`${diskType} icon`} className="w-full h-full object-contain select-none" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-[#f5f5f7]">{device.displayName}</h2>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <StatusBadge label={device.bsdName} type="default" />
            <StatusBadge label={diskType} type="info" />
            <StatusBadge label={device.isInternal ? 'Internal' : 'External'} type={device.isInternal ? 'default' : 'warning'} />
            <StatusBadge label={formatSize(device.sizeBytes)} type="default" />
            <StatusBadge label={device.transport} type="default" />
          </div>
          {(device.serial || report?.firmwareVersion) && (
            <div className="flex flex-wrap gap-x-4 mt-2">
              {device.serial && <span className="text-xs text-[#6e6e73] font-mono">S/N: {device.serial}</span>}
              {report?.firmwareVersion && <span className="text-xs text-[#6e6e73] font-mono">FW: {report.firmwareVersion}</span>}
            </div>
          )}
          {!device.isInternal && (device.linkSpeed || device.bridgeChip) && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {device.linkSpeed && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#5e5ce6]/10 border border-[#5e5ce6]/15">
                  <Cable className="w-3 h-3 text-[#bf5af2]" />
                  <span className="text-[11px] font-medium text-[#bf5af2]">
                    {device.linkSpeed}
                  </span>
                </div>
              )}
              {device.bridgeChip && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-separator bg-white/[0.03]">
                  <HardDrive className="w-3 h-3 text-[#a1a1a6]" />
                  <span className="text-[11px] font-medium text-[#a1a1a6]">
                    {device.bridgeChip} bridge
                  </span>
                </div>
              )}
            </div>
          )}
          {device.connectionPath && !device.isInternal && (
            <p className="text-[11px] text-[#6e6e73] mt-1.5">
              Path: {device.connectionPath}
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="space-y-3 animate-pulse">
          <div className="h-4 bg-white/[0.06] rounded w-1/3"></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-20 bg-white/[0.04] rounded-lg"></div>
            <div className="h-20 bg-white/[0.04] rounded-lg"></div>
            <div className="h-20 bg-white/[0.04] rounded-lg"></div>
            <div className="h-20 bg-white/[0.04] rounded-lg"></div>
          </div>
        </div>
      )}

      {!loading && report && !report.readable && !errorDismissed && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-[#ff453a]/8 border border-[#ff453a]/15 relative">
          <AlertTriangle className="w-5 h-5 text-[#ff453a] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-[#ff453a]">SMART Data Unavailable</h4>
            <p className="text-sm mt-1 text-[#ff453a]/70">{report.failureReason}</p>
            <p className="text-xs mt-2 text-[#6e6e73]">
              {getSmartUnavailableHint(device, report)}
            </p>
          </div>
          <button 
            onClick={() => setErrorDismissed(true)} 
            className="p-1 hover:bg-white/[0.06] rounded-md transition-colors text-[#6e6e73] hover:text-[#a1a1a6]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!loading && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-medium text-[#98989d] flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              Live Transfer Rate
              <span className="text-[11px] text-[#48484a] ml-1">
                {SPEED_SAMPLE_MS / 1000}s samples / {SPEED_WINDOW_SECONDS}s window
              </span>
            </h3>

            <button
              type="button"
              onClick={() => setShowEma(prev => !prev)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                showEma
                  ? 'bg-primary/15 text-[#64d2ff] border border-primary/20'
                  : 'bg-white/[0.04] text-[#6e6e73] border border-separator hover:text-[#a1a1a6] hover:bg-white/[0.06]'
              }`}
            >
              EMA {showEma ? 'On' : 'Off'}
            </button>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 mb-3">
            <div className="rounded-lg border border-[#32d74b]/15 bg-[#32d74b]/6 px-3.5 py-2.5">
              <div className="text-[11px] text-[#32d74b]/70">Read Now</div>
              <div className="mt-0.5 text-base font-semibold text-[#32d74b] font-mono">
                {latestSample ? formatRate(latestSample.readSpeed) : 'Collecting...'}
              </div>
            </div>
            <div className="rounded-lg border border-[#ff9f0a]/15 bg-[#ff9f0a]/6 px-3.5 py-2.5">
              <div className="text-[11px] text-[#ff9f0a]/70">Write Now</div>
              <div className="mt-0.5 text-base font-semibold text-[#ff9f0a] font-mono">
                {latestSample ? formatRate(latestSample.writeSpeed) : 'Collecting...'}
              </div>
            </div>
            <div className="rounded-lg border border-separator bg-surface px-3.5 py-2.5">
              <div className="text-[11px] text-[#6e6e73]">Peak Read 60s</div>
              <div className="mt-0.5 text-base font-semibold text-[#f5f5f7] font-mono">{formatRate(peakRead)}</div>
            </div>
            <div className="rounded-lg border border-separator bg-surface px-3.5 py-2.5">
              <div className="text-[11px] text-[#6e6e73]">Peak Write 60s</div>
              <div className="mt-0.5 text-base font-semibold text-[#f5f5f7] font-mono">{formatRate(peakWrite)}</div>
            </div>
          </div>

          <div className="relative h-64 min-w-0 w-full bg-surface rounded-lg border border-separator p-4 pl-0">
            <div ref={chartContainerRef} className="h-full w-full min-w-0">
              {canRenderSpeedChart && (
                <LineChart
                  width={chartSize.width}
                  height={chartSize.height}
                  data={speedHistory}
                  margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis 
                    type="number"
                    dataKey="timestamp"
                    scale="time"
                    domain={[chartStart, chartEnd]}
                    stroke="#48484a" 
                    fontSize={10} 
                    tickMargin={10} 
                    minTickGap={20}
                    tickCount={6}
                    tickFormatter={(value) => formatTimeLabel(Number(value))}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    domain={[0, yAxisMax]}
                    stroke="#48484a" 
                    fontSize={10} 
                    tickFormatter={(value) => formatRate(Number(value))}
                    axisLine={false}
                    tickLine={false}
                    width={78}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1c1c1e', borderColor: '#3a3a3c', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ padding: '2px 0' }}
                    labelFormatter={(label) => `${formatTimeLabel(Number(label))} · ${(SPEED_SAMPLE_MS / 1000).toFixed(0)}s avg`}
                    formatter={(value, name) => {
                      const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
                      return [formatRate(numericValue), String(name)];
                    }}
                    labelStyle={{ color: '#98989d', marginBottom: '4px' }}
                    cursor={{ stroke: '#48484a', strokeDasharray: '4 4' }}
                  />
                  <Line 
                    type="linear" 
                    dataKey="readSpeed" 
                    name="Read" 
                    stroke="#32d74b" 
                    strokeWidth={1.5} 
                    dot={false}
                    isAnimationActive={false}
                    activeDot={{ r: 3, fill: '#32d74b', stroke: '#1c1c1e' }}
                  />
                  <Line 
                    type="linear" 
                    dataKey="writeSpeed" 
                    name="Write" 
                    stroke="#ff9f0a" 
                    strokeWidth={1.5} 
                    dot={false}
                    isAnimationActive={false}
                    activeDot={{ r: 3, fill: '#ff9f0a', stroke: '#1c1c1e' }}
                  />
                  {showEma && (
                    <Line
                      type="linear"
                      dataKey="readEma"
                      name="Read EMA"
                      stroke="#30db5b"
                      strokeOpacity={0.6}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  )}
                  {showEma && (
                    <Line
                      type="linear"
                      dataKey="writeEma"
                      name="Write EMA"
                      stroke="#ffd60a"
                      strokeOpacity={0.6}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
              )}
            </div>
            {speedHistory.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-[#6e6e73] pointer-events-none">
                Collecting 2s disk activity samples...
              </div>
            )}
          </div>
        </div>
      )}

      {/* SMART Health & Details */}
      {!loading && report && report.readable && (
        <>
          <div>
            <h3 className="text-sm font-medium text-[#98989d] mb-2 flex items-center gap-1.5">
              <HeartPulse className="w-3.5 h-3.5" />
              Drive Snapshot
            </h3>
            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.9fr] gap-2">
              {health && (
                <div className={`rounded-lg border px-4 py-3 ${health.panelClass}`}>
                  <div className="text-[11px] text-[#6e6e73]">Health Assessment</div>
                  <div className={`mt-1.5 text-2xl font-semibold ${health.accentClass}`}>
                    {health.label}
                  </div>
                  <p className="mt-1.5 text-[13px] text-[#a1a1a6] leading-5">
                    {health.summary}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <MetricCard
                  icon={<Thermometer />}
                  label="Temperature"
                  value={currentTemp !== undefined && currentTemp !== null ? `${currentTemp}°C` : 'N/A'}
                />
                <MetricCard
                  icon={<Shield />}
                  label="Health Status"
                  value={report.healthPassed === undefined ? 'Unknown' : report.healthPassed ? 'Passed' : 'Failing'}
                />
                <MetricCard
                  icon={<Clock />}
                  label="Power On Hours"
                  value={report.powerOnHours !== undefined ? report.powerOnHours.toLocaleString() : 'N/A'}
                />
                {isAtaHdd ? (
                  <MetricCard
                    icon={<HardDrive />}
                    label="Rotation Rate"
                    value={report.rotationRateRpm !== undefined ? `${report.rotationRateRpm.toLocaleString()} RPM` : 'N/A'}
                  />
                ) : (
                  <MetricCard
                    icon={<Zap />}
                    label="Power Cycles"
                    value={report.powerCycles !== undefined ? report.powerCycles.toLocaleString() : 'N/A'}
                  />
                )}
              </div>
            </div>
          </div>

          {isAta && (report.reallocatedSectors !== undefined || report.currentPendingSectors !== undefined || report.offlineUncorrectable !== undefined || report.udmaCrcErrors !== undefined) && (
            <div>
              <h3 className="text-sm font-medium text-[#98989d] mb-2 flex items-center gap-1.5">
                <TriangleAlert className="w-3.5 h-3.5" />
                Surface & Reliability
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <MetricCard icon={<AlertTriangle />} label="Reallocated Sectors" value={report.reallocatedSectors?.toLocaleString() ?? 'N/A'} />
                <MetricCard icon={<AlertTriangle />} label="Current Pending" value={report.currentPendingSectors?.toLocaleString() ?? 'N/A'} />
                <MetricCard icon={<AlertTriangle />} label="Offline Uncorrectable" value={report.offlineUncorrectable?.toLocaleString() ?? 'N/A'} />
                <MetricCard icon={<Cable />} label="UDMA CRC Errors" value={report.udmaCrcErrors?.toLocaleString() ?? 'N/A'} />
              </div>
            </div>
          )}

          {isAtaHdd && (
            <div>
              <h3 className="text-sm font-medium text-[#98989d] mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                Mechanical Counters
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <MetricCard icon={<Zap />} label="Power Cycles" value={report.powerCycles?.toLocaleString() ?? 'N/A'} />
                <MetricCard icon={<Clock />} label="Start/Stop Count" value={report.startStopCount?.toLocaleString() ?? 'N/A'} />
                <MetricCard icon={<Activity />} label="Load/Unload Count" value={report.loadUnloadCount?.toLocaleString() ?? 'N/A'} />
                <MetricCard icon={<AlertTriangle />} label="Spin Retry Count" value={report.spinRetryCount?.toLocaleString() ?? 'N/A'} />
              </div>
            </div>
          )}

          {(report.firmwareVersion || report.sataVersion || report.interfaceSpeed || report.logicalSectorSize) && (
            <div>
              <h3 className="text-sm font-medium text-[#98989d] mb-2 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Device Information
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {report.firmwareVersion && (
                  <MetricCard icon={<HardDrive />} label="Firmware" value={report.firmwareVersion} />
                )}
                {report.interfaceSpeed && (
                  <MetricCard icon={<Cable />} label="Negotiated Link" value={report.interfaceSpeed} />
                )}
                {report.sataVersion && (
                  <MetricCard icon={<Cable />} label="SATA Version" value={report.sataVersion} />
                )}
                {report.logicalSectorSize && (
                  <MetricCard icon={<Database />} label="Logical Sector" value={formatBlockSize(report.logicalSectorSize)} />
                )}
                {report.physicalSectorSize && (
                  <MetricCard icon={<Database />} label="Physical Sector" value={formatBlockSize(report.physicalSectorSize)} />
                )}
              </div>
            </div>
          )}

          {(report.dataUnitsRead !== undefined || report.percentageUsed !== undefined) && (
            <div>
              <h3 className="text-sm font-medium text-[#98989d] mb-2 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Usage Statistics
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <MetricCard icon={<Activity />} label="Wear Level" value={report.percentageUsed !== undefined ? `${report.percentageUsed}% Used` : 'N/A'} />
                <MetricCard icon={<HardDrive />} label="Available Spare" value={report.availableSpare !== undefined ? `${report.availableSpare}%` : 'N/A'} />
                <MetricCard icon={<Database />} label="Data Read" value={formatUnits(report.dataUnitsRead)} />
                <MetricCard icon={<Database />} label="Data Written" value={formatUnits(report.dataUnitsWritten)} />
              </div>
            </div>
          )}

          {(report.unsafeShutdowns !== undefined || report.mediaErrors !== undefined || report.errorLogEntries !== undefined) && (
            <div>
              <h3 className="text-sm font-medium text-[#98989d] mb-2 flex items-center gap-1.5">
                <TriangleAlert className="w-3.5 h-3.5" />
                Error Counters
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {report.unsafeShutdowns !== undefined && (
                  <MetricCard icon={<AlertTriangle />} label="Unsafe Shutdowns" value={report.unsafeShutdowns.toLocaleString()} />
                )}
                {report.mediaErrors !== undefined && (
                  <MetricCard icon={<AlertTriangle />} label="Media Errors" value={report.mediaErrors.toLocaleString()} />
                )}
                {report.errorLogEntries !== undefined && (
                  <MetricCard icon={<AlertTriangle />} label="Error Log Entries" value={report.errorLogEntries.toLocaleString()} />
                )}
              </div>
            </div>
          )}

          {displayedAttributes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-sm font-medium text-[#98989d] flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  SMART Attributes
                  <span className="text-[11px] text-[#48484a] ml-1">
                    {displayedAttributes.length} of {report.rawAttributes?.length ?? 0}
                  </span>
                </h3>
                {(report.rawAttributes?.length ?? 0) > displayedAttributes.length || showAllAttributes ? (
                  <button
                    type="button"
                    onClick={() => setShowAllAttributes(prev => !prev)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      showAllAttributes
                        ? 'bg-primary/15 text-[#64d2ff] border border-primary/20'
                        : 'bg-white/[0.04] text-[#6e6e73] border border-separator hover:text-[#a1a1a6] hover:bg-white/[0.06]'
                    }`}
                  >
                    {showAllAttributes ? 'Key Only' : 'Show All'}
                  </button>
                ) : null}
              </div>
              <div className="rounded-lg border border-separator overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-surface-hover text-[#6e6e73] text-xs">
                      <th className="text-center py-2 px-1.5 font-medium w-7"></th>
                      <th className="text-left py-2 px-3 font-medium w-14">ID</th>
                      <th className="text-left py-2 px-3 font-medium">Attribute</th>
                      <th className="text-right py-2 px-3 font-medium w-18">Current</th>
                      <th className="text-right py-2 px-3 font-medium w-18">Worst</th>
                      <th className="text-right py-2 px-3 font-medium w-18">Thresh</th>
                      <th className="text-right py-2 px-3 font-medium w-28">Raw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAttributes.map((attribute: SmartAttribute, index: number) => {
                      const status = getAttributeHealthStatus(attribute);
                      return (
                        <tr
                          key={attribute.id}
                          className={`border-t border-separator ${index % 2 === 0 ? '' : 'bg-white/[0.015]'} ${ATTRIBUTE_ROW_CLASSES[status]}`}
                        >
                          <td className="py-2 px-1.5 text-center">
                            <span className={`inline-block w-2 h-2 rounded-full ${ATTRIBUTE_DOT_CLASSES[status]}`} />
                          </td>
                          <td className="py-2 px-3 text-[#a1a1a6] font-mono">{attribute.id}</td>
                          <td className="py-2 px-3 text-[#e5e5ea]">{formatAttributeName(attribute.name)}</td>
                          <td className="py-2 px-3 text-right text-[#a1a1a6] font-mono">{attribute.value ?? '—'}</td>
                          <td className="py-2 px-3 text-right text-[#a1a1a6] font-mono">{attribute.worst ?? '—'}</td>
                          <td className="py-2 px-3 text-right text-[#a1a1a6] font-mono">{attribute.threshold ?? '—'}</td>
                          <td className="py-2 px-3 text-right text-[#e5e5ea] font-mono">{attribute.rawString ?? attribute.rawValue ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {device.volumes && device.volumes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-[#98989d] mb-2.5 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" />
            Volumes & File Systems
          </h3>
          <div className="rounded-lg border border-separator overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-surface-hover text-[#6e6e73] text-xs">
                  <th className="text-left py-2 px-3 font-medium">Volume</th>
                  <th className="text-left py-2 px-3 font-medium">File System</th>
                  <th className="text-left py-2 px-3 font-medium w-32">Usage</th>
                  <th className="text-right py-2 px-3 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {device.volumes.map((vol, i) => (
                  <tr key={vol.bsdName} className={`border-t border-separator ${i % 2 === 0 ? '' : 'bg-white/[0.015]'} hover:bg-white/[0.03] transition-colors`}>
                    <td className="py-2 px-3">
                      <div className="font-medium text-[#e5e5ea]">{vol.name}</div>
                      <div className="text-[11px] text-[#6e6e73] font-mono mt-0.5">{vol.mountPoint ? vol.mountPoint : vol.bsdName}</div>
                    </td>
                    <td className="py-2 px-3">
                      <StatusBadge label={vol.fileSystem || 'Unknown'} type="info" />
                    </td>
                    <td className="py-2 px-3">
                      {vol.capacityUsed !== undefined && vol.sizeBytes > 0 ? (
                        <div className="flex flex-col gap-1 w-full max-w-[140px]">
                          <div className="flex justify-between text-xs">
                            <span className="text-[#a1a1a6]">{formatSize(vol.capacityUsed)}</span>
                            <span className="text-[#6e6e73] font-mono text-[10px]">{Math.round((vol.capacityUsed / vol.sizeBytes) * 100)}%</span>
                          </div>
                          <div className="h-1 w-full bg-white/[0.08] rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full"
                              style={{ 
                                width: `${Math.min(100, Math.max(0, (vol.capacityUsed / vol.sizeBytes) * 100))}%`,
                                backgroundColor: ((vol.capacityUsed / vol.sizeBytes) * 100) > 90 ? '#ff453a' : '#007AFF'
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[#48484a] text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-[#a1a1a6]">
                      {formatSize(vol.sizeBytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
