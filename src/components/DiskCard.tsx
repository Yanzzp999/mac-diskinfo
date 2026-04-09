import type { DiskDevice } from '../shared/types';
import { StatusBadge } from './StatusBadge';
import hddImg from '../assets/hdd-flat.svg';
import ssdImg from '../assets/ssd-flat.svg';
import nvmeImg from '../assets/nvme-flat.svg';

interface DiskCardProps {
  device: DiskDevice;
  selected: boolean;
  onClick: () => void;
}

export function DiskCard({ device, selected, onClick }: DiskCardProps) {
  const formatSize = (bytes: number) => {
    const gb = bytes / (1000 * 1000 * 1000);
    return gb >= 1000 ? `${(gb / 1000).toFixed(2)} TB` : `${gb.toFixed(0)} GB`;
  };

  const isNVMe = device.transport.toUpperCase().includes('NVME') || device.transport.toUpperCase().includes('FABRIC') || device.transport.toUpperCase().includes('PCI');
  const diskType = device.isSolidState === false ? 'HDD' : (isNVMe ? 'NVMe' : 'SSD');

  let TransportImg = ssdImg;
  if (diskType === 'HDD') TransportImg = hddImg;
  else if (diskType === 'NVMe') TransportImg = nvmeImg;

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-200 border
        ${selected
          ? 'bg-blue-500/10 border-blue-500/30 shadow-lg shadow-blue-500/5'
          : 'bg-transparent border-transparent hover:bg-white/[0.03] hover:border-white/10'
        }`}
    >
      <div className="flex-shrink-0 w-12 h-12 rounded-lg border border-white/10 overflow-hidden bg-[#1e293b] shadow-sm">
        <img src={TransportImg} alt={`${diskType} icon`} className="w-full h-full object-contain select-none" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className={`text-sm font-semibold truncate ${selected ? 'text-white' : 'text-slate-200'}`}>
          {device.displayName}
        </h3>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <StatusBadge label={diskType} type="info" />
          <StatusBadge label={formatSize(device.sizeBytes)} type="default" />
          {device.smartStatus?.includes('Verified')
            ? <StatusBadge label="Healthy" type="success" />
            : <StatusBadge label={device.smartStatus || 'Unknown'} type="warning" />
          }
        </div>
      </div>
    </div>
  );
}
