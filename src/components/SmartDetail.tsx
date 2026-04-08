import type { SmartReport } from '../shared/types';
import type { DiskDevice } from '../shared/types';
import { MetricCard } from './MetricCard';
import { StatusBadge } from './StatusBadge';
import { Thermometer, Activity, Clock, AlertTriangle, Database, Zap, HeartPulse, HardDrive, Shield, TriangleAlert } from 'lucide-react';
import hddImg from '../assets/hdd.png';
import ssdImg from '../assets/ssd.png';
import nvmeImg from '../assets/nvme.png';

interface SmartDetailProps {
  device: DiskDevice;
  report: SmartReport | null;
  loading: boolean;
}

export function SmartDetail({ device, report, loading }: SmartDetailProps) {
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
      {!loading && report && !report.readable && (
        <div className="flex items-start gap-3 p-5 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-300">SMART Data Unavailable</h4>
            <p className="text-sm mt-1 text-red-400/80">{report.failureReason}</p>
            <p className="text-xs mt-3 text-slate-500">
              This is common for USB external drives. The enclosure may not support SMART passthrough.
            </p>
          </div>
        </div>
      )}

      {/* SMART Health Indicators */}
      {!loading && report && report.readable && (
        <>
          {/* Health Overview */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-emerald-400" />
              Health Indicators
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <MetricCard
                icon={<Thermometer className="w-5 h-5" />}
                label="Temperature"
                value={report.temperatureC !== undefined ? `${report.temperatureC}°C` : 'N/A'}
              />
              <MetricCard
                icon={<Shield className="w-5 h-5" />}
                label="Health Status"
                value={report.healthPassed === undefined ? 'Unknown' : report.healthPassed ? 'Passed' : 'Failing'}
              />
              <MetricCard
                icon={<Clock className="w-5 h-5" />}
                label="Power On Hours"
                value={report.powerOnHours !== undefined ? report.powerOnHours.toLocaleString() : 'N/A'}
              />
              <MetricCard
                icon={<Zap className="w-5 h-5" />}
                label="Power Cycles"
                value={report.powerCycles !== undefined ? report.powerCycles.toLocaleString() : 'N/A'}
              />
            </div>
          </div>

          {/* Usage Statistics */}
          {(report.dataUnitsRead !== undefined || report.percentageUsed !== undefined) && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-400" />
                Usage Statistics
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <MetricCard icon={<Activity className="w-5 h-5" />} label="Wear Level" value={report.percentageUsed !== undefined ? `${report.percentageUsed}% Used` : 'N/A'} />
                <MetricCard icon={<HardDrive className="w-5 h-5" />} label="Available Spare" value={report.availableSpare !== undefined ? `${report.availableSpare}%` : 'N/A'} />
                <MetricCard icon={<Database className="w-5 h-5" />} label="Data Read" value={formatUnits(report.dataUnitsRead)} />
                <MetricCard icon={<Database className="w-5 h-5" />} label="Data Written" value={formatUnits(report.dataUnitsWritten)} />
              </div>
            </div>
          )}

          {/* Error Counters */}
          {(report.unsafeShutdowns !== undefined || report.mediaErrors !== undefined) && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
                <TriangleAlert className="w-4 h-4 text-amber-400" />
                Error Counters
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <MetricCard icon={<AlertTriangle className="w-5 h-5" />} label="Unsafe Shutdowns" value={report.unsafeShutdowns?.toLocaleString() ?? 'N/A'} />
                <MetricCard icon={<AlertTriangle className="w-5 h-5" />} label="Media Errors" value={report.mediaErrors?.toLocaleString() ?? 'N/A'} />
                {report.errorLogEntries !== undefined && (
                  <MetricCard icon={<AlertTriangle className="w-5 h-5" />} label="Error Log Entries" value={report.errorLogEntries.toLocaleString()} />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* No SMART report loaded yet */}
      {!loading && !report && (
        <div className="text-center py-12 text-slate-500">
          <HardDrive className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Loading SMART data...</p>
        </div>
      )}
    </div>
  );
}
