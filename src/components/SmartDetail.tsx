import type { SmartReport } from '../shared/types';
import type { DiskDevice } from '../shared/types';
import { MetricCard } from './MetricCard';
import { StatusBadge } from './StatusBadge';
import { Thermometer, Activity, Clock, AlertTriangle, Database, Zap, HeartPulse, HardDrive, Shield, TriangleAlert, X, Cable } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import hddImg from '../assets/hdd.png';
import ssdImg from '../assets/ssd.png';
import nvmeImg from '../assets/nvme.png';
import { useState, useEffect, useRef } from 'react';

interface SmartDetailProps {
  device: DiskDevice;
  report: SmartReport | null;
  loading: boolean;
}

export function SmartDetail({ device, report, loading }: SmartDetailProps) {
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [liveTemp, setLiveTemp] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [speedHistory, setSpeedHistory] = useState<{time: string, readSpeed: number, writeSpeed: number}[]>([]);

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
    
    window.electron.startDiskSpeedMonitor(device.bsdName);
    
    const handleSpeedUpdate = (data: any) => {
      if (data.bsdName !== device.bsdName) return;
      
      const readMB = data.readSpeedBytes / (1024 * 1024);
      const writeMB = data.writeSpeedBytes / (1024 * 1024);
      const timeStr = new Date(data.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      setSpeedHistory(prev => {
        const newHistory = [...prev, { time: timeStr, readSpeed: readMB, writeSpeed: writeMB }];
        // Keep last 30 data points (60 seconds at 2s interval)
        if (newHistory.length > 30) {
          return newHistory.slice(newHistory.length - 30);
        }
        return newHistory;
      });
    };
    
    window.electron.onDiskSpeedUpdate(handleSpeedUpdate);
    
    return () => {
      window.electron.removeDiskSpeedUpdateListener();
      window.electron.stopDiskSpeedMonitor(device.bsdName);
    };
  }, [device.bsdName]);

  const currentTemp = liveTemp ?? report?.temperatureC;

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
          <img src={TransportImg} alt={`${diskType} icon`} className="w-full h-full object-cover select-none" />
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
          <h3 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5 text-pink-400" />
            Live Transfer Rate
          </h3>
          <div className="relative h-64 w-full bg-[#1e293b] rounded-xl border border-white/5 p-4 pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={speedHistory} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickMargin={10} 
                  minTickGap={20}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickFormatter={(val) => `${val.toFixed(1)} MB/s`}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ padding: '2px 0' }}
                  formatter={(value, name) => {
                    const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
                    return [`${numericValue.toFixed(2)} MB/s`, String(name)];
                  }}
                  labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="readSpeed" 
                  name="Read" 
                  stroke="#3b82f6" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 4, fill: '#3b82f6', stroke: '#0f172a' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="writeSpeed" 
                  name="Write" 
                  stroke="#ec4899" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 4, fill: '#ec4899', stroke: '#0f172a' }}
                />
              </LineChart>
            </ResponsiveContainer>
            {speedHistory.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500 pointer-events-none">
                Collecting disk activity samples...
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
