import { useState } from 'react';
import type { DiskDevice, SmartReport } from '../shared/types';
import { StatusBadge } from './StatusBadge';
import { SmartDetail } from './SmartDetail';
import { ChevronDown, ChevronUp, Usb, Cpu, Server } from 'lucide-react';

interface DiskCardProps {
  device: DiskDevice;
}

export function DiskCard({ device }: DiskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [report, setReport] = useState<SmartReport | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSmartData = async () => {
    if (!expanded && !report) {
      setLoading(true);
      try {
        const data = await window.electron.getSmartReport(device.id);
        setReport(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(!expanded);
  };

  const formatSize = (bytes: number) => {
    const gb = bytes / (1000 * 1000 * 1000);
    return gb >= 1000 ? `${(gb / 1000).toFixed(2)} TB` : `${gb.toFixed(0)} GB`;
  };

  // Determine icon based on transport
  let TransportIcon = Server;
  if (device.transport.toUpperCase().includes('USB')) TransportIcon = Usb;
  else if (device.transport.toUpperCase().includes('NVME') || device.transport.toUpperCase().includes('FABRIC') || device.transport.toUpperCase().includes('PCI')) TransportIcon = Cpu;

  return (
    <div className="bg-surface rounded-2xl border border-white/10 overflow-hidden shadow-lg transition-all duration-300 hover:border-white/20 group/card">
      {/* Header */}
      <div 
        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={fetchSmartData}
      >
        <div className="flex items-center space-x-5">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover/card:scale-110 group-hover/card:bg-blue-500/20 transition-all duration-300">
            <TransportIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-100 flex items-center">
              {device.displayName}
            </h3>
            <div className="flex flex-wrap gap-2 mt-2 items-center">
              <StatusBadge label={device.bsdName} type="default" />
              <StatusBadge label={device.isInternal ? 'Internal' : 'External'} type={device.isInternal ? 'info' : 'warning'} />
              <StatusBadge label={formatSize(device.sizeBytes)} type="default" />
              <StatusBadge label={device.transport} type="default" />
              {device.smartStatus && device.smartStatus.includes('Verified') && <StatusBadge label="Verified" type="success" />}
            </div>
          </div>
        </div>

        <div className="mt-4 sm:mt-0 flex items-center justify-end space-x-4">
           {device.smartStatus && !device.smartStatus.includes('Verified') && <StatusBadge label={device.smartStatus} type="danger" />}
           <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-400 group-hover/card:bg-white/10 group-hover/card:text-slate-200 transition-colors">
              {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
           </div>
        </div>
      </div>

      {/* Expanded Detail */}
      <div className={`transition-all duration-500 ease-in-out origin-top overflow-hidden bg-background/30 ${expanded ? 'opacity-100 max-h-[1000px]' : 'opacity-0 max-h-0'}`}>
        <SmartDetail report={report} loading={loading} />
      </div>
    </div>
  );
}
