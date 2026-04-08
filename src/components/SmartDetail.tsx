import type { SmartReport } from '../shared/types';
import { MetricCard } from './MetricCard';
import { Thermometer, Activity, Clock, AlertTriangle, Database, Zap, HeartPulse } from 'lucide-react';

interface SmartDetailProps {
  report: SmartReport | null;
  loading: boolean;
}

export function SmartDetail({ report, loading }: SmartDetailProps) {
  if (loading) {
    return (
      <div className="p-6 bg-surface-hover/20 animate-pulse border-t border-white/5">
        <div className="h-4 bg-white/10 rounded w-1/4 mb-6"></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-20 bg-white/5 rounded-xl"></div>
          <div className="h-20 bg-white/5 rounded-xl"></div>
          <div className="h-20 bg-white/5 rounded-xl"></div>
          <div className="h-20 bg-white/5 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  if (!report.readable) {
    return (
      <div className="p-6 bg-red-500/5 border-t border-red-500/10">
        <div className="flex items-start space-x-3 text-red-400 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold">SMART Data Unavailable</h4>
            <p className="text-sm mt-1 text-red-300 opacity-90">{report.failureReason}</p>
          </div>
        </div>
      </div>
    );
  }

  // Format data units to bytes roughly (thousands of 512 byte sectors)
  const formatUnits = (units?: number) => {
    if (units === undefined) return 'N/A';
    const bytes = units * 1000 * 512;
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1000) return `${(gb / 1024).toFixed(2)} TB`;
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <div className="p-6 border-t border-white/5 bg-gradient-to-b from-surface/50 to-transparent">
      <h4 className="text-sm font-medium text-slate-300 mb-4 flex items-center">
        <HeartPulse className="w-4 h-4 mr-2 text-emerald-400" />
        SMART Health Indicators
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          icon={<Thermometer className="w-5 h-5" />} 
          label="Temperature" 
          value={report.temperatureC !== undefined ? `${report.temperatureC}°C` : 'N/A'} 
        />
        <MetricCard 
          icon={<Activity className="w-5 h-5" />} 
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

      {(report.dataUnitsRead !== undefined || report.percentageUsed !== undefined) && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-slate-300 mb-4 flex items-center">
            <Database className="w-4 h-4 mr-2 text-blue-400" />
            Usage Statistics
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
             <MetricCard icon={<Activity className="w-5 h-5"/>} label="Wear Level" value={report.percentageUsed !== undefined ? `${report.percentageUsed}% Used` : 'N/A'} />
             <MetricCard icon={<Database className="w-5 h-5"/>} label="Available Spare" value={report.availableSpare !== undefined ? `${report.availableSpare}%` : 'N/A'} />
             <MetricCard icon={<Activity className="w-5 h-5"/>} label="Data Read" value={formatUnits(report.dataUnitsRead)} />
             <MetricCard icon={<Activity className="w-5 h-5"/>} label="Data Written" value={formatUnits(report.dataUnitsWritten)} />
          </div>
        </div>
      )}
    </div>
  );
}
