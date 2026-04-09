import type { DiskDevice, DiskSpeedData, SmartReport } from '../shared/types';
import { MetricCard } from './MetricCard';
import { StatusBadge } from './StatusBadge';
import { Thermometer, Activity, Clock, AlertTriangle, Database, Zap, HeartPulse, HardDrive, Shield, TriangleAlert, X, Cable } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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

const SPEED_SAMPLE_MS = 2_000;
const SPEED_WINDOW_MS = 60_000;
const SPEED_WINDOW_SECONDS = SPEED_WINDOW_MS / 1_000;
const EMA_ALPHA = 0.35;
const INITIAL_Y_AXIS_MAX_MB = 8;
const MIN_Y_AXIS_MAX_MB = 1;
const Y_AXIS_PADDING = 1.15;
const Y_AXIS_DECAY_THRESHOLD = 0.7;
const Y_AXIS_DECAY_FACTOR = 0.88;

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

export function SmartDetail({ device, report, loading }: SmartDetailProps) {
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [liveTemp, setLiveTemp] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [speedHistory, setSpeedHistory] = useState<SpeedSample[]>([]);
  const [showEma, setShowEma] = useState(false);
  const [yAxisMax, setYAxisMax] = useState(INITIAL_Y_AXIS_MAX_MB);

  useEffect(() => {
    setErrorDismissed(false);
  }, [device.id, loading]);

  // Poll temperature every 5s for SMART-capable disks
  useEffect(() => {
    // Clear previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setLiveTemp(null);

    // Only poll if the report is readable (SMART supported)
    if (!report?.readable) return;

    const fetchTemp = async () => {
      try {
        const temp = await window.electron.getTemperature(device.id);
        if (temp !== null) setLiveTemp(temp);
      } catch (_) {}
    };

    // Start polling
    fetchTemp();
    intervalRef.current = setInterval(fetchTemp, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [device.id, report?.readable]);

  // Disk Speed Monitoring
  useEffect(() => {
    setSpeedHistory([]);
    setYAxisMax(INITIAL_Y_AXIS_MAX_MB);

    window.electron.startDiskSpeedMonitor(device.bsdName);

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
        return [...prev.filter(sample => sample.timestamp >= cutoff), nextSample];
      });
    };

    window.electron.onDiskSpeedUpdate(handleSpeedUpdate);

    return () => {
      window.electron.removeDiskSpeedUpdateListener();
      window.electron.stopDiskSpeedMonitor(device.bsdName);
    };
  }, [device.bsdName]);

  useEffect(() => {
    if (speedHistory.length === 0) {
      setYAxisMax(INITIAL_Y_AXIS_MAX_MB);
      return;
    }

    const observedMax = speedHistory.reduce(
      (maxValue, sample) => Math.max(maxValue, sample.readSpeed, sample.writeSpeed),
      0
    );
    const targetMax = clampAxisMax(observedMax * Y_AXIS_PADDING);

    setYAxisMax(prev => {
      if (targetMax > prev) return targetMax;
      if (targetMax < prev * Y_AXIS_DECAY_THRESHOLD) {
        return clampAxisMax(Math.max(targetMax, prev * Y_AXIS_DECAY_FACTOR));
      }
      return prev;
    });
  }, [speedHistory]);

  const currentTemp = liveTemp ?? report?.temperatureC;
  const latestSample = speedHistory.length > 0 ? speedHistory[speedHistory.length - 1] : null;
  const peakRead = speedHistory.reduce((maxValue, sample) => Math.max(maxValue, sample.readSpeed), 0);
  const peakWrite = speedHistory.reduce((maxValue, sample) => Math.max(maxValue, sample.writeSpeed), 0);
  const chartEnd = latestSample?.timestamp ?? Date.now();
  const chartStart = chartEnd - SPEED_WINDOW_MS;

  const isNVMe = device.transport.toUpperCase().includes('NVME') || device.transport.toUpperCase().includes('FABRIC') || device.transport.toUpperCase().includes('PCI');
  const diskType = device.isSolidState === false ? 'HDD' : (isNVMe ? 'NVMe' : 'SSD');

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
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Device Header */}
      <div className="flex items-center gap-5 pb-6 border-b border-white/10">
        <div className="flex-shrink-0 w-20 h-20 rounded-2xl border border-white/10 overflow-hidden bg-[#1e293b] shadow-lg">
          <img src={TransportImg} alt={`${diskType} icon`} className="w-full h-full object-contain select-none" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">{device.displayName}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            <StatusBadge label={device.bsdName} type="default" />
            <StatusBadge label={diskType} type="info" />
            <StatusBadge label={device.isInternal ? 'Internal' : 'External'} type={device.isInternal ? 'default' : 'warning'} />
            <StatusBadge label={formatSize(device.sizeBytes)} type="default" />
            <StatusBadge label={device.transport} type="default" />
          </div>
          {device.serial && (
            <p className="text-xs text-slate-500 mt-2 font-mono">S/N: {device.serial}</p>
          )}
          {/* Link Speed for external drives */}
          {device.linkSpeed && !device.isInternal && (
            <div className="flex items-center gap-2 mt-2.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-500/15 to-cyan-500/15 border border-purple-500/20">
                <Cable className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-medium bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-cyan-300">
                  {device.linkSpeed}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-4 bg-white/10 rounded w-1/3"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-24 bg-white/5 rounded-xl"></div>
            <div className="h-24 bg-white/5 rounded-xl"></div>
            <div className="h-24 bg-white/5 rounded-xl"></div>
            <div className="h-24 bg-white/5 rounded-xl"></div>
          </div>
        </div>
      )}

      {/* SMART Unavailable */}
      {!loading && report && !report.readable && !errorDismissed && (
        <div className="flex items-start gap-3 p-5 rounded-xl bg-red-500/10 border border-red-500/20 relative">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-red-300">SMART Data Unavailable</h4>
            <p className="text-sm mt-1 text-red-400/80">{report.failureReason}</p>
            <p className="text-xs mt-3 text-slate-500">
              This is common for USB external drives. The enclosure may not support SMART passthrough.
            </p>
          </div>
          <button 
            onClick={() => setErrorDismissed(true)} 
            className="p-1 hover:bg-red-500/20 rounded-md transition-colors text-red-400/70 hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Live Disk IO Chart */}
      {!loading && (
        <div className="pt-2">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Activity className="w-3.5 h-3.5 text-pink-400" />
                Live Transfer Rate
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/[0.03]">
                  {SPEED_SAMPLE_MS / 1000}s samples
                </span>
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/[0.03]">
                  {SPEED_WINDOW_SECONDS}s window
                </span>
                <span className="px-2 py-1 rounded-full border border-white/10 bg-white/[0.03]">
                  Raw linear
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowEma(prev => !prev)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                showEma
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                  : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              EMA {showEma ? 'On' : 'Off'}
            </button>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 mb-3">
            <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-blue-200/70">Read Now</div>
              <div className="mt-1 text-lg font-semibold text-blue-200 font-mono">
                {latestSample ? formatRate(latestSample.readSpeed) : 'Collecting...'}
              </div>
            </div>
            <div className="rounded-xl border border-pink-500/15 bg-pink-500/5 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-pink-200/70">Write Now</div>
              <div className="mt-1 text-lg font-semibold text-pink-200 font-mono">
                {latestSample ? formatRate(latestSample.writeSpeed) : 'Collecting...'}
              </div>
            </div>
            <div className="rounded-xl border border-blue-500/10 bg-white/[0.02] px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Peak Read 60s</div>
              <div className="mt-1 text-lg font-semibold text-slate-100 font-mono">{formatRate(peakRead)}</div>
            </div>
            <div className="rounded-xl border border-pink-500/10 bg-white/[0.02] px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Peak Write 60s</div>
              <div className="mt-1 text-lg font-semibold text-slate-100 font-mono">{formatRate(peakWrite)}</div>
            </div>
          </div>

          <div className="relative h-72 w-full bg-[#1e293b] rounded-xl border border-white/5 p-4 pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={speedHistory} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                <XAxis 
                  type="number"
                  dataKey="timestamp"
                  scale="time"
                  domain={[chartStart, chartEnd]}
                  stroke="#64748b" 
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
                  stroke="#64748b" 
                  fontSize={10} 
                  tickFormatter={(value) => formatRate(Number(value))}
                  axisLine={false}
                  tickLine={false}
                  width={78}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ padding: '2px 0' }}
                  labelFormatter={(label) => `${formatTimeLabel(Number(label))} · ${(SPEED_SAMPLE_MS / 1000).toFixed(0)}s avg`}
                  formatter={(value, name) => {
                    const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
                    return [formatRate(numericValue), String(name)];
                  }}
                  labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                  cursor={{ stroke: '#475569', strokeDasharray: '4 4' }}
                />
                <Line 
                  type="linear" 
                  dataKey="readSpeed" 
                  name="Read" 
                  stroke="#3b82f6" 
                  strokeWidth={2} 
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, fill: '#3b82f6', stroke: '#0f172a' }}
                />
                <Line 
                  type="linear" 
                  dataKey="writeSpeed" 
                  name="Write" 
                  stroke="#ec4899" 
                  strokeWidth={2} 
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, fill: '#ec4899', stroke: '#0f172a' }}
                />
                {showEma && (
                  <Line
                    type="linear"
                    dataKey="readEma"
                    name="Read EMA"
                    stroke="#93c5fd"
                    strokeOpacity={0.8}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
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
                    stroke="#f9a8d4"
                    strokeOpacity={0.8}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
            {speedHistory.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500 pointer-events-none">
                Collecting 2s disk activity samples...
              </div>
            )}
          </div>
        </div>
      )}

      {/* SMART Health Indicators */}
      {!loading && report && report.readable && (
        <>
          {/* Health Overview */}
          <div>
            <h3 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
              <HeartPulse className="w-3.5 h-3.5 text-emerald-400" />
              Health Indicators
            </h3>
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
              <MetricCard
                icon={<Zap />}
                label="Power Cycles"
                value={report.powerCycles !== undefined ? report.powerCycles.toLocaleString() : 'N/A'}
              />
            </div>
          </div>

          {/* Usage Statistics */}
          {(report.dataUnitsRead !== undefined || report.percentageUsed !== undefined) && (
            <div>
              <h3 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                <Database className="w-3.5 h-3.5 text-blue-400" />
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

          {/* Error Counters */}
          {(report.unsafeShutdowns !== undefined || report.mediaErrors !== undefined) && (
            <div>
              <h3 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                <TriangleAlert className="w-3.5 h-3.5 text-amber-400" />
                Error Counters
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <MetricCard icon={<AlertTriangle />} label="Unsafe Shutdowns" value={report.unsafeShutdowns?.toLocaleString() ?? 'N/A'} />
                <MetricCard icon={<AlertTriangle />} label="Media Errors" value={report.mediaErrors?.toLocaleString() ?? 'N/A'} />
                {report.errorLogEntries !== undefined && (
                  <MetricCard icon={<AlertTriangle />} label="Error Log Entries" value={report.errorLogEntries.toLocaleString()} />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Volumes & File Systems */}
      {device.volumes && device.volumes.length > 0 && (
        <div className="pt-2">
          <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            Volumes & File Systems
          </h3>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="text-left py-2.5 px-4 font-medium">Volume</th>
                  <th className="text-left py-2.5 px-4 font-medium">File System</th>
                  <th className="text-left py-2.5 px-4 font-medium w-32">Usage</th>
                  <th className="text-right py-2.5 px-4 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {device.volumes.map((vol, i) => (
                  <tr key={vol.bsdName} className={`border-t border-white/5 ${i % 2 === 0 ? '' : 'bg-white/[0.02]'} hover:bg-white/[0.04] transition-colors`}>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-200">{vol.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">{vol.mountPoint ? vol.mountPoint : vol.bsdName}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusBadge label={vol.fileSystem || 'Unknown'} type="info" />
                    </td>
                    <td className="py-2.5 px-4">
                      {vol.capacityUsed !== undefined && vol.sizeBytes > 0 ? (
                        <div className="flex flex-col gap-1.5 w-full max-w-[140px]">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300">{formatSize(vol.capacityUsed)}</span>
                            <span className="text-slate-500 font-mono text-[10px]">{Math.round((vol.capacityUsed / vol.sizeBytes) * 100)}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${((vol.capacityUsed / vol.sizeBytes) * 100) > 90 ? 'bg-red-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(100, Math.max(0, (vol.capacityUsed / vol.sizeBytes) * 100))}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-300">
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
