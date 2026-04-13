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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${device.displayName}, ${formatSize(device.sizeBytes)}, ${diskType}, ${device.smartStatus || 'SMART status unknown'}`}
      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar
        ${selected
          ? 'bg-[#3a3a3c]'
          : 'hover:bg-white/[0.04]'
        }`}
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-[#3a3a3c]">
        <img src={TransportImg} alt={`${diskType} icon`} className="w-full h-full object-contain select-none" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className={`text-[13px] font-medium truncate ${selected ? 'text-[#f5f5f7]' : 'text-[#e5e5ea]'}`}>
          {device.displayName}
        </h3>
        <div className="flex flex-wrap gap-1 mt-1">
          <StatusBadge label={diskType} type="info" />
          <StatusBadge label={formatSize(device.sizeBytes)} type="default" />
          {device.smartStatus?.includes('Verified')
            ? <StatusBadge label="Healthy" type="success" />
            : <StatusBadge label={device.smartStatus || 'Unknown'} type="warning" />
          }
        </div>
      </div>
    </button>
  );
}
